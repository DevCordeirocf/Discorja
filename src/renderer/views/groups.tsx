import type { GroupsViewState } from '../features/groups/groups-feature';
import type { GroupRoom } from '../../shared/protocol';
import { GROUP_NAME_MAX } from '../../shared/groups';
import { DISPLAY_NAME_MAX } from '../../shared/validation';
import { SyncedInput } from '../ui/components/synced-input';
import { MenuItem, PopoverMenu } from './menu';
import { AvatarStack, OnlineChip, avatarTone } from './people';
import {
  MODAL_BODY,
  Modal,
  ModalDescription,
  ModalFooter,
  ModalHeading,
  ModalPlainTitle,
  ModalTitle,
} from './modal';

const STATUS_TEXT: Record<GroupsViewState['status'], string> = {
  idle: '',
  connecting: 'Conectando ao servidor…',
  waking: 'Acordando o servidor… isso pode levar até 1 minuto.',
  online: '',
  unsupported:
    'O servidor ainda não suporta grupos. Atualize o servidor de sinalização.',
  offline: 'Sem conexão com o servidor. Tentando de novo…',
};

export interface GroupHomeView extends GroupsViewState {
  enabled: boolean;
  displayName: string;
  /** Code of the room this app is in, to mark its card. */
  currentRoomCode: string | null;
  menuOpen: boolean;
}

/** Two letters for the group button: the first letters of the first two words. */
export function groupInitials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  const letters =
    words.length > 1
      ? [...words[0]!][0]! + [...words[1]!][0]!
      : [...(words[0] ?? '?')].slice(0, 2).join('');
  return letters.toLocaleUpperCase('pt-BR');
}

const initial = (name: string) =>
  [...name.trim()][0]?.toLocaleUpperCase('pt-BR') ?? '?';

type FormView = Pick<GroupHomeView, 'draftName' | 'draftInvite' | 'enabled'>;

function GroupForm(props: {
  kind: 'create' | 'join';
  prefix: string;
  view: FormView;
  heading: 'h2' | 'h3';
  /** The dialog names the form through its tabs instead. */
  hiddenHeading?: boolean;
}) {
  const { kind, prefix, view } = props;
  const Heading = props.heading;
  const create = kind === 'create';
  const id = `${prefix}-group-${create ? 'name' : 'invite'}`;
  return (
    <form className="flex flex-1 flex-col gap-3" data-group-form={kind}>
      <Heading className={props.hiddenHeading ? 'sr-only' : 'm-0 text-[18px]'}>
        {create ? 'Criar grupo' : 'Entrar com convite'}
      </Heading>
      <label className="field-label" htmlFor={id}>
        {create ? 'Nome do grupo' : 'Cole o convite que você recebeu'}
      </label>
      {create ? (
        <SyncedInput
          id={id}
          className="text-input"
          data-group-field="name"
          maxLength={GROUP_NAME_MAX}
          autoComplete="off"
          placeholder="Ex.: Calvos de Terno"
          value={view.draftName}
        />
      ) : (
        <SyncedInput
          id={id}
          className="text-input"
          data-group-field="invite"
          autoComplete="off"
          spellCheck={false}
          placeholder="DJG1…"
          value={view.draftInvite}
        />
      )}
      <button
        className={`button ${create ? 'primary' : 'secondary'} wide mt-auto`}
        type="submit"
        disabled={!view.enabled}
      >
        {create ? 'Criar grupo' : 'Entrar no grupo'}
      </button>
    </form>
  );
}

function Welcome({ view }: { view: GroupHomeView }) {
  const card = 'flex rounded-[16px] border p-[22px]';
  return (
    <section
      className="mx-auto flex min-h-full max-w-[760px] flex-col justify-center gap-7"
      aria-labelledby="welcome-title"
    >
      <header>
        <h1 id="welcome-title" className="mx-0 mt-0 mb-2 text-[30px]">
          Bem-vindo ao Discorja
        </h1>
        <p className="m-0 text-[15px] leading-[1.5] text-muted">
          As salas ficam dentro dos grupos. Crie um grupo e convide alguém, ou
          entre com o convite que você recebeu.
        </p>
      </header>
      {!view.displayName.trim() && (
        <div className="flex max-w-[360px] flex-col gap-2">
          <label className="field-label" htmlFor="display-name">
            Seu nome
          </label>
          <SyncedInput
            id="display-name"
            className="text-input"
            autoComplete="nickname"
            maxLength={DISPLAY_NAME_MAX}
            placeholder=""
            value={view.displayName}
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 max-[760px]:grid-cols-1">
        <div className={`${card} border-transparent bg-selected`}>
          <GroupForm kind="create" prefix="welcome" view={view} heading="h2" />
        </div>
        <div className={`${card} border-[#2b2c37] bg-surface`}>
          <GroupForm kind="join" prefix="welcome" view={view} heading="h2" />
        </div>
      </div>
      <footer className="flex flex-wrap items-center justify-start gap-6 text-[12px] leading-[18px] text-purple">
        <span>
          Criado por{' '}
          <a
            className="text-inherit underline decoration-[rgb(184_160_255/55%)] underline-offset-3 transition-[color,text-decoration-color] duration-[140ms] hover:text-text hover:decoration-current focus-visible:outline-offset-3"
            href="https://github.com/DevCordeiroCf"
            target="_blank"
            rel="noopener noreferrer"
          >
            DevCordeiroCf
          </a>
        </span>
      </footer>
    </section>
  );
}

function RoomCard(props: {
  room: GroupRoom;
  view: GroupHomeView;
  canUse: boolean;
}) {
  const { room, view } = props;
  const here = room.code === view.currentRoomCode;
  const full = !here && room.participants >= room.maxParticipants;
  const shown = room.members.slice(0, 4);
  const extra = room.participants - shown.length;
  const people = room.members.length
    ? `Na sala: ${room.members.join(', ')}`
    : 'Sala vazia';
  const button =
    'button min-h-10 rounded-[10px] px-4 py-2 disabled:cursor-default disabled:border-[#2b2c37] disabled:text-kbd';
  return (
    <li className="room-card flex flex-col gap-[14px] rounded-[14px] border border-[#2b2c37] bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 truncate text-[15px] font-medium tracking-normal">
          {room.name}
        </h3>
        {room.publications ? (
          <span className="flex-none rounded-full bg-[#1d3a30] px-2.5 py-[3px] text-[12px] text-mint">
            <span aria-hidden="true">●</span> {room.publications}{' '}
            {room.publications === 1 ? 'tela' : 'telas'} ao vivo
          </span>
        ) : (
          <span className="flex-none text-[12px] text-kbd">
            Sem tela ao vivo
          </span>
        )}
      </div>
      <div className="flex items-center justify-between">
        <AvatarStack
          label={people}
          initials={shown.map(initial)}
          extra={extra}
        />
        <span className="flex-none text-[12px] text-kbd">
          {room.participants}/{room.maxParticipants}
        </span>
      </div>
      {here ? (
        <button
          type="button"
          className={`${button} border-transparent bg-[#1d3a30] text-mint`}
          data-action="room"
        >
          Você está aqui
        </button>
      ) : (
        <button
          type="button"
          className={`${button} ${full ? 'subtle' : 'border border-purple bg-transparent text-purple'}`}
          data-action="join-group-room"
          data-code={room.code}
          aria-label={
            full ? `Sala ${room.name} cheia` : `Entrar na sala ${room.name}`
          }
          disabled={!props.canUse || full}
        >
          {full ? 'Sala cheia' : 'Entrar'}
        </button>
      )}
    </li>
  );
}

const SECTION_TITLE =
  'm-0 [font:500_13px_var(--font-display)] tracking-[0.02em] text-[#a9a8bb]';

function GroupPage({ view }: { view: GroupHomeView }) {
  const selected = view.selected!;
  const canUse = view.enabled && view.status === 'online';
  const rooms = view.listing?.rooms ?? [];
  const online = view.listing?.online ?? [];
  const live = rooms.filter((room) => room.publications > 0).length;
  const inRoom = new Set(rooms.flatMap((room) => room.members));
  const summary = view.listing
    ? `${online.length} online · ${live === 1 ? '1 sala ao vivo' : `${live} salas ao vivo`}`
    : 'Carregando as salas…';
  const status = STATUS_TEXT[view.status];
  const waiting = view.status === 'waking' || view.status === 'connecting';
  return (
    <section
      className="mx-auto flex max-w-[1100px] flex-col gap-[22px] pb-6"
      aria-labelledby="group-title"
    >
      {status && (
        <p
          className="m-0 flex items-center gap-2.5 rounded-[10px] border border-[#343a55] bg-[#1f2230] px-[14px] py-2.5 text-[13px] text-[#c9cde6]"
          role="status"
        >
          <span
            className={`size-2 flex-none rounded-full ${waiting ? 'bg-[#ffc86b]' : 'bg-[#ff8a8a]'}`}
            aria-hidden="true"
          />
          {status}
        </p>
      )}
      <header className="flex items-center justify-between gap-4 max-[760px]:flex-col max-[760px]:items-stretch">
        <div className="flex min-w-0 items-center gap-[14px]">
          <span
            className="grid size-[52px] flex-none place-items-center rounded-[16px] bg-selected [font:700_18px_var(--font-display)] text-purple"
            aria-hidden="true"
          >
            {groupInitials(selected.name)}
          </span>
          <div>
            <h1 id="group-title" className="m-0 truncate text-[24px]">
              {selected.name}
            </h1>
            <p className="mx-0 mt-[2px] mb-0 text-[13px] text-muted">
              {summary}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="button secondary min-h-10 px-4 py-2"
            data-action="copy-group-invite"
          >
            Convidar
          </button>
          <div className="relative" data-menu>
            <button
              type="button"
              className="icon-button size-10 rounded-[10px] border border-line bg-surface text-[18px] text-muted"
              data-action="toggle-group-menu"
              data-menu-toggle
              aria-haspopup="menu"
              aria-expanded={view.menuOpen}
              aria-label="Mais opções do grupo"
              title="Mais opções do grupo"
            >
              <span aria-hidden="true">⋯</span>
            </button>
            {view.menuOpen && (
              <PopoverMenu
                label="Opções do grupo"
                className="top-[calc(100%+8px)] right-0 w-[200px]"
              >
                <MenuItem action="leave-group" danger>
                  Sair do grupo
                </MenuItem>
              </PopoverMenu>
            )}
          </div>
        </div>
      </header>
      <section
        className="flex items-center justify-between gap-4 rounded-[14px] bg-selected px-5 py-[18px] text-[16px] font-medium max-[760px]:flex-col max-[760px]:items-stretch"
        aria-label="Criar sala no grupo"
      >
        <span>Começar uma sala neste grupo</span>
        <button
          type="button"
          className="button primary min-h-11"
          data-action="create-group-room"
          disabled={!canUse}
        >
          + Criar sala
        </button>
      </section>
      <section className="flex flex-col gap-3" aria-labelledby="live-title">
        <h2 id="live-title" className={SECTION_TITLE}>
          Ao vivo agora
        </h2>
        {rooms.length ? (
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-[14px] p-0">
            {rooms.map((room) => (
              <RoomCard
                key={room.code}
                room={room}
                view={view}
                canUse={canUse}
              />
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-control-line p-9 text-center">
            <strong>Nenhuma sala aberta</strong>
            {view.status !== 'online' && (
              <span className="m-0 text-[13px] text-muted">
                As salas aparecem quando a conexão com o servidor estiver
                pronta.
              </span>
            )}
          </div>
        )}
      </section>
      <section className="flex flex-col gap-3" aria-labelledby="online-title">
        <h2 id="online-title" className={SECTION_TITLE}>
          Online agora
        </h2>
        {online.length ? (
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {online.map((name, index) => (
              <OnlineChip
                key={index}
                as="li"
                photo={view.onlinePhotos[index] ?? ''}
                initial={initial(name)}
                tone={avatarTone(index)}
              >
                {name}
                {inRoom.has(name) && <small>· na sala</small>}
              </OnlineChip>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[13px] text-muted">
            Ninguém com o grupo aberto agora.
          </p>
        )}
      </section>
    </section>
  );
}

/** Início: the selected group's rooms, or the welcome screen without groups. */
export function GroupHome({ view }: { view: GroupHomeView }) {
  return view.selected ? <GroupPage view={view} /> : <Welcome view={view} />;
}

export function AddGroupModal({
  view,
}: {
  view: FormView & { tab: 'join' | 'create' };
}) {
  const tab = (id: 'join' | 'create', label: string) => (
    <button
      type="button"
      className="h-9 cursor-pointer rounded-[9px] border-0 bg-transparent text-[13px] text-kbd aria-selected:bg-selected aria-selected:text-text"
      role="tab"
      id={`add-group-tab-${id}`}
      aria-selected={view.tab === id}
      aria-controls="add-group-panel"
      tabIndex={view.tab === id ? 0 : -1}
      data-action="add-group-tab"
      data-tab={id}
    >
      {label}
    </button>
  );
  return (
    <Modal
      labelledBy="add-group-title"
      className={`w-[min(440px,calc(100vw-32px))] pb-[29px] ${MODAL_BODY}`}
    >
      <ModalHeading
        className="mb-[31px] items-start"
        close={{ action: 'close-modal', label: 'Fechar' }}
      >
        <ModalTitle id="add-group-title">Adicionar grupo</ModalTitle>
      </ModalHeading>
      <div
        className="mb-[18px] grid grid-cols-2 rounded-[12px] bg-[#121318] p-1"
        role="tablist"
        aria-label="Como adicionar"
      >
        {tab('join', 'Entrar com convite')}
        {tab('create', 'Criar novo')}
      </div>
      <div
        id="add-group-panel"
        role="tabpanel"
        aria-labelledby={`add-group-tab-${view.tab}`}
      >
        <GroupForm
          kind={view.tab}
          prefix="add"
          view={view}
          heading="h3"
          hiddenHeading
        />
      </div>
    </Modal>
  );
}

export function LeaveGroupModal({ group }: { group: { name: string } }) {
  return (
    <Modal labelledBy="leave-group-title" className={`w-[510px] ${MODAL_BODY}`}>
      <ModalPlainTitle id="leave-group-title">Sair do grupo?</ModalPlainTitle>
      <ModalDescription>
        O grupo "{group.name}" será removido deste aplicativo. Para voltar, você
        vai precisar de um novo convite.
      </ModalDescription>
      <ModalFooter>
        <button className="button subtle" data-action="cancel-leave-group">
          Cancelar
        </button>
        <button className="button primary" data-action="confirm-leave-group">
          Sair do grupo
        </button>
      </ModalFooter>
    </Modal>
  );
}
