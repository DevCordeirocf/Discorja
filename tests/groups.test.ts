import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { GROUP_INVITE } from '../src/shared/groups';
import {
  createGroupSecret,
  deriveGroupKey,
  encodeInvite,
  parseInvite,
} from '../src/renderer/features/groups/group-invite';
import { createGroupStore } from '../src/renderer/state/group-store';
import {
  createGroupLobby,
  type LobbyConnection,
} from '../src/renderer/features/groups/group-lobby';
import {
  groupInitials,
  renderAddGroupModal,
  renderGroupHome,
} from '../src/renderer/views/groups';
import type { ServerMessage } from '../src/shared/protocol';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('convites de grupo', () => {
  it('codifica e lê o convite com nome acentuado', () => {
    const secret = createGroupSecret();
    const invite = encodeInvite({ secret, name: 'Turma do sábado' });
    expect(GROUP_INVITE.test(invite)).toBe(true);
    expect(parseInvite(`  ${invite}  `)).toEqual({
      secret,
      name: 'Turma do sábado',
    });
  });

  it('recusa convites malformados', () => {
    const secret = createGroupSecret();
    const control = Buffer.from('a\u0001b').toString('base64url');
    for (const text of [
      '',
      `DJG2.${secret}.YQ`,
      `DJG1.${secret.slice(1)}.YQ`,
      `DJG1.${secret}.`,
      `DJG1.${secret}.${control}`,
    ])
      expect(parseInvite(text)).toBeNull();
  });

  it('o servidor só recebe o hash do segredo', async () => {
    const secret = 'A'.repeat(22);
    expect(await deriveGroupKey(secret)).toBe(
      createHash('sha256').update(`discorja-group-v1|${secret}`).digest('hex'),
    );
  });
});

describe('grupos salvos no aplicativo', () => {
  it('guarda até oito grupos sem duplicar', () => {
    const store = createGroupStore(memoryStorage());
    const first = { secret: 'A'.repeat(22), name: 'Um' };
    expect(store.add(first)).toBe(true);
    expect(store.add(first)).toBe(false);
    for (let index = 1; index < 8; index++)
      store.add({ secret: String(index).repeat(22), name: `G${index}` });
    expect(store.add({ secret: 'B'.repeat(22), name: 'Nove' })).toBe(false);
    expect(store.list()).toHaveLength(8);
    store.remove(first.secret);
    expect(store.list()).toHaveLength(7);
  });

  it('ignora dados corrompidos', () => {
    const storage = memoryStorage();
    storage.setItem(
      'discorja.groups',
      JSON.stringify({ v: 1, groups: [{ secret: 'x', name: 'y' }, 5] }),
    );
    expect(createGroupStore(storage).list()).toEqual([]);
    storage.setItem('discorja.groups', '{oops');
    expect(createGroupStore(storage).list()).toEqual([]);
  });
});

describe('lobby de grupos', () => {
  function fakeLobby(connect: () => Promise<number>) {
    const sent: unknown[] = [];
    let deliver: (message: ServerMessage) => void = () => undefined;
    const statuses: string[] = [];
    const onListing = vi.fn();
    const lobby = createGroupLobby({
      getSignalingUrl: () => 'wss://exemplo.test',
      getName: () => 'Bia',
      onListing,
      onStatus: (status) => statuses.push(status),
      warmUp: async () => true,
      createConnection: (_url, onMessage): LobbyConnection => {
        deliver = onMessage;
        return {
          connect,
          send: (message) => void sent.push(message),
          disconnect: () => undefined,
        };
      },
    });
    return {
      lobby,
      sent,
      statuses,
      onListing,
      deliver: (message: ServerMessage) => deliver(message),
    };
  }

  it('acompanha os grupos quando a página abre', async () => {
    const key = 'a'.repeat(64);
    const fake = fakeLobby(async () => 5);
    fake.lobby.setKeys([key]);
    fake.lobby.setActive(true);
    await tick();
    expect(fake.statuses).toContain('online');
    expect(fake.sent).toEqual([
      { type: 'subscribe-group', groupKey: key, name: 'Bia' },
    ]);
    fake.deliver({
      type: 'group-state',
      groupKey: key,
      rooms: [],
      online: ['Bia'],
    });
    expect(fake.onListing).toHaveBeenCalledWith(key, {
      rooms: [],
      online: ['Bia'],
    });
    fake.lobby.setKeys([]);
    expect(fake.sent.at(-1)).toEqual({
      type: 'unsubscribe-group',
      groupKey: key,
    });
    fake.lobby.setActive(false);
    expect(fake.lobby.status).toBe('idle');
  });

  it('avisa quando o servidor é antigo', async () => {
    const fake = fakeLobby(async () => {
      throw new Error(
        'O servidor de sinalização usa uma versão incompatível com este aplicativo.',
      );
    });
    fake.lobby.setActive(true);
    await tick();
    expect(fake.lobby.status).toBe('unsupported');
  });
});

describe('início com grupos', () => {
  const group = { secret: 'A'.repeat(22), name: '<Turma>', addedAt: 0 };
  const room = {
    code: 'ABCDEFGH',
    name: 'Sala <x>',
    ownerName: 'Ana',
    participants: 2,
    maxParticipants: 10,
    publications: 1,
    members: ['Ana', '<b>'],
  };
  const view = (
    overrides: Partial<Parameters<typeof renderGroupHome>[0]> = {},
  ): Parameters<typeof renderGroupHome>[0] => ({
    groups: [group],
    selected: group,
    listing: { rooms: [room], online: ['Ana', 'Caio'] },
    status: 'online',
    draftName: '',
    draftInvite: '',
    leaving: null,
    addTab: 'join',
    liveGroups: [group.secret],
    enabled: true,
    displayName: 'Ana',
    currentRoomCode: null,
    menuOpen: false,
    ...overrides,
  });

  it('escapa nomes e mostra as salas para entrar com um clique', () => {
    const html = renderGroupHome(view());
    expect(html).toContain('&lt;Turma&gt;');
    expect(html).toContain('Sala &lt;x&gt;');
    expect(html).toContain('Na sala: Ana, &lt;b&gt;');
    expect(html).toContain('1 tela ao vivo');
    expect(html).toContain('2 online · 1 sala ao vivo');
    expect(html).toContain(
      'data-action="join-group-room" data-code="ABCDEFGH"',
    );
    expect(html).toContain('data-action="create-group-room"');
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('room-code');
  });

  it('marca a sala atual e bloqueia salas cheias', () => {
    const here = renderGroupHome(view({ currentRoomCode: 'ABCDEFGH' }));
    expect(here).toContain('Você está aqui');
    expect(here).not.toContain('data-action="join-group-room"');
    const full = renderGroupHome(
      view({
        listing: {
          rooms: [{ ...room, participants: 10, maxParticipants: 10 }],
          online: [],
        },
      }),
    );
    expect(full).toMatch(
      /data-action="join-group-room"[^>]*disabled>Sala cheia/u,
    );
  });

  it('só permite criar sala com o servidor pronto e mostra o motivo', () => {
    const html = renderGroupHome(view({ status: 'waking' }));
    expect(html).toContain('Acordando o servidor');
    expect(html).toMatch(/data-action="create-group-room" disabled/u);
  });

  it('abre o menu do grupo com a opção de sair', () => {
    expect(renderGroupHome(view())).not.toContain('data-action="leave-group"');
    const open = renderGroupHome(view({ menuOpen: true }));
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain('data-action="leave-group"');
  });

  it('mostra boas-vindas sem grupos e pede o nome quando falta', () => {
    const html = renderGroupHome(
      view({ groups: [], selected: null, listing: null, displayName: '' }),
    );
    expect(html).toContain('Bem-vindo ao Discorja');
    expect(html).toContain('id="display-name"');
    expect(html).toContain('data-group-form="create"');
    expect(html).toContain('data-group-form="join"');
    expect(html).not.toContain('Código da sala');
    const named = renderGroupHome(
      view({ groups: [], selected: null, listing: null }),
    );
    expect(named).not.toContain('id="display-name"');
  });

  it('alterna as abas do diálogo de adicionar grupo', () => {
    const join = renderAddGroupModal({
      tab: 'join',
      draftName: '',
      draftInvite: '<x>',
      enabled: true,
    });
    expect(join).toContain('role="dialog"');
    expect(join).toContain('id="add-group-tab-join" aria-selected="true"');
    expect(join).toContain('data-group-form="join"');
    expect(join).toContain('value="&lt;x&gt;"');
    const create = renderAddGroupModal({
      tab: 'create',
      draftName: '',
      draftInvite: '',
      enabled: false,
    });
    expect(create).toContain('data-group-form="create"');
    expect(create).toMatch(/type="submit" disabled/u);
  });

  it('gera as iniciais do grupo', () => {
    expect(groupInitials('Turma do sábado')).toBe('TD');
    expect(groupInitials('família')).toBe('FA');
    expect(groupInitials('  ')).toBe('?');
  });
});
