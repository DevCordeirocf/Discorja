import type { StorageLike } from '../../state/preference-store';
import { createGroupStore, type StoredGroup } from '../../state/group-store';
import { MAX_LOCAL_GROUPS } from '../../../shared/groups';
import { createAvatarCache } from '../profile/avatar-cache';
import {
  createGroupSecret,
  deriveGroupKey,
  encodeInvite,
  parseInvite,
  validGroupName,
} from './group-invite';
import {
  createGroupLobby,
  type GroupListing,
  type GroupLobbyOptions,
  type LobbyStatus,
} from './group-lobby';

export interface GroupsViewState {
  groups: StoredGroup[];
  selected: StoredGroup | null;
  listing: GroupListing | null;
  status: LobbyStatus;
  draftName: string;
  draftInvite: string;
  leaving: StoredGroup | null;
  /** Tab of the "Adicionar grupo" dialog. */
  addTab: 'join' | 'create';
  /** Secrets of the groups with at least one live screen, for the side bar. */
  liveGroups: string[];
  /** Photo URL for each name in `listing.online`; '' shows the initial. */
  onlinePhotos: string[];
}

export interface GroupsFeatureOptions {
  storage?: StorageLike;
  getSignalingUrl(): string;
  getDisplayName(): string;
  /** The saved photo, shared with the groups in "Online agora". */
  getProfilePhoto?(): string;
  reducedMotion?(): boolean;
  render(): void;
  notify(message: string, kind?: 'error' | 'info' | 'success'): void;
  copyInvite(invite: string): Promise<void>;
  createRoom(groupKey: string): void;
  joinRoom(code: string): void;
  openLeaveConfirm(): void;
  closeModal(): void;
  lobby?: Partial<GroupLobbyOptions>;
}

/** Groups: saved invites, the live room listing and the related actions. */
export function createGroupsFeature(options: GroupsFeatureOptions) {
  const store = createGroupStore(options.storage);
  const keys = new Map<string, string>();
  const listings = new Map<string, GroupListing>();
  let selectedSecret: string | null = store.list()[0]?.secret ?? null;
  let status: LobbyStatus = 'idle';
  let draftName = '';
  let draftInvite = '';
  let leavingSecret: string | null = null;
  let addTab: 'join' | 'create' = 'join';

  // Photos of "Online agora", fetched once per avatarId and checked by hash.
  const photos = createAvatarCache({
    request: (groupKey, avatarId) => lobby.requestAvatar(groupKey, avatarId),
    onChange: () => options.render(),
    reducedMotion: () => options.reducedMotion?.() ?? false,
  });
  const lobby = createGroupLobby({
    getSignalingUrl: options.getSignalingUrl,
    getName: options.getDisplayName,
    getPhoto: () => options.getProfilePhoto?.() ?? '',
    onAvatar: (photo) =>
      void photos.receive({
        peerId: photo.groupKey,
        avatarId: photo.avatarId,
        avatar: photo.avatar,
      }),
    onListing: (groupKey, listing) => {
      listings.set(groupKey, listing);
      options.render();
    },
    onStatus: (next) => {
      status = next;
      options.render();
    },
    ...options.lobby,
  });

  /** Hashes each saved secret once and follows the resulting keys. */
  const syncKeys = async () => {
    const groups = store.list();
    for (const group of groups)
      if (!keys.has(group.secret))
        keys.set(group.secret, await deriveGroupKey(group.secret));
    for (const secret of [...keys.keys()])
      if (!groups.some((group) => group.secret === secret)) {
        listings.delete(keys.get(secret)!);
        keys.delete(secret);
      }
    lobby.setKeys(groups.map((group) => keys.get(group.secret)!));
  };
  void syncKeys();

  const select = (secret: string | null) => {
    selectedSecret = secret;
    options.render();
  };

  const addGroup = async (group: {
    secret: string;
    name: string;
  }): Promise<boolean> => {
    if (store.list().some((entry) => entry.secret === group.secret)) {
      select(group.secret);
      options.notify('Você já está nesse grupo.', 'info');
      return true;
    }
    if (!store.add(group)) {
      options.notify(
        `Você pode ter até ${MAX_LOCAL_GROUPS} grupos. Saia de um para entrar em outro.`,
        'error',
      );
      return false;
    }
    await syncKeys();
    select(group.secret);
    return true;
  };

  const selectedKey = () =>
    selectedSecret ? keys.get(selectedSecret) : undefined;

  return {
    view(): GroupsViewState {
      const groups = store.list();
      const selected =
        groups.find((group) => group.secret === selectedSecret) ??
        groups[0] ??
        null;
      const key = selected ? keys.get(selected.secret) : undefined;
      const listing = key ? (listings.get(key) ?? null) : null;
      return {
        groups,
        selected,
        listing,
        // Photos are only requested while the listing connection is up.
        onlinePhotos: (listing?.avatars ?? []).map((avatarId) =>
          key && avatarId && status === 'online'
            ? (photos.urlFor(key, avatarId) ?? '')
            : '',
        ),
        status,
        draftName,
        draftInvite,
        leaving: groups.find((group) => group.secret === leavingSecret) ?? null,
        addTab,
        liveGroups: groups
          .filter((group) => {
            const groupKey = keys.get(group.secret);
            const rooms = groupKey ? listings.get(groupKey)?.rooms : undefined;
            return !!rooms?.some((room) => room.publications > 0);
          })
          .map((group) => group.secret),
      };
    },
    /** Shares a saved name or photo with the groups. */
    refreshProfile(): void {
      lobby.refreshProfile();
    },
    /** The lobby only runs while the Início page is on screen. */
    setVisible(visible: boolean): void {
      lobby.setActive(visible && store.list().length > 0);
    },
    setDraft(field: 'name' | 'invite', value: string): void {
      if (field === 'name') draftName = value;
      else draftInvite = value;
    },
    setAddTab(tab: 'join' | 'create'): void {
      addTab = tab;
    },
    /** Resolves to true when the group is saved, so a dialog can close. */
    async createGroup(): Promise<boolean> {
      const name = draftName.trim();
      if (!validGroupName(name)) {
        options.notify('Dê um nome ao grupo com até 32 caracteres.', 'error');
        return false;
      }
      if (!(await addGroup({ secret: createGroupSecret(), name })))
        return false;
      draftName = '';
      options.notify(
        'Grupo criado. Copie o convite e envie para alguém.',
        'success',
      );
      return true;
    },
    async joinGroup(): Promise<boolean> {
      const invite = parseInvite(draftInvite);
      if (!invite) {
        options.notify(
          'Convite inválido. Cole o texto completo que começa com DJG1.',
          'error',
        );
        return false;
      }
      if (!(await addGroup(invite))) return false;
      draftInvite = '';
      return true;
    },
    select,
    async copyInvite(): Promise<void> {
      const group = store
        .list()
        .find((entry) => entry.secret === selectedSecret);
      if (!group) return;
      try {
        await options.copyInvite(encodeInvite(group));
        options.notify(
          'Convite copiado. Quem tiver o convite verá as salas do grupo.',
          'success',
        );
      } catch {
        options.notify('Não foi possível copiar o convite.', 'error');
      }
    },
    askLeave(): void {
      leavingSecret = selectedSecret;
      options.openLeaveConfirm();
    },
    async confirmLeave(): Promise<void> {
      if (leavingSecret) store.remove(leavingSecret);
      leavingSecret = null;
      selectedSecret = store.list()[0]?.secret ?? null;
      options.closeModal();
      await syncKeys();
      options.render();
    },
    cancelLeave(): void {
      leavingSecret = null;
      options.closeModal();
      options.render();
    },
    createRoomInGroup(): void {
      const key = selectedKey();
      if (key) options.createRoom(key);
    },
    joinListedRoom(code: string): void {
      options.joinRoom(code);
    },
  };
}

export type GroupsFeature = ReturnType<typeof createGroupsFeature>;
