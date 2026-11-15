import type { ReactNode } from 'react';
import type { MultiRoomState, RoomParticipant } from '../../shared/protocol';
import {
  ReceiveAudioControls,
  SendAudioToggle,
  type ReceiveAudioControlState,
  type SendAudioControlState,
} from './audio-controls';
import {
  ConnectionAlert,
  DesignIcon,
  DiagnosticsTrigger,
  PAUSED_PREVIEW_NOTE,
  StreamVideo,
  VideoReconnecting,
} from './room-parts';

export interface StageViewProps {
  state: MultiRoomState;
  watching: string | null;
  sharing: boolean;
  /** The stream on the stage: the chosen publication or your preview. */
  stream: MediaStream | null;
  hasRemote: boolean;
  hasLocal: boolean;
  busy: boolean;
  issue: string;
  recovering: boolean;
  /** The signaling connection is recovering while a video plays. */
  reconnectingVideo: boolean;
  sendAudio: Omit<SendAudioControlState, 'className'>;
  receiveAudio: ReceiveAudioControlState;
  /** Resolves a participant's photo URL (inline JPEG or cached blob). */
  avatarUrl?: (person: RoomParticipant) => string | undefined;
}

type Person = MultiRoomState['participants'][number];

// Buttons in the toolbar under the stage.
const TOOLBAR_BUTTON = 'min-h-10 px-3 py-2 text-[12px]';
const MENU_BUTTON =
  'button subtle justify-start text-left text-[11px] whitespace-normal';

function MemberMenu(props: {
  person: Person;
  state: MultiRoomState;
  moderate: boolean;
  owner: boolean;
}) {
  const { person, state, moderate, owner } = props;
  const publication = state.publications.find(
    (entry) => entry.publisherId === person.peerId,
  );
  const canRemove =
    moderate &&
    person.peerId !== state.selfId &&
    person.role !== 'owner' &&
    (owner || person.role !== 'moderator');
  const stop = moderate && publication && person.peerId !== state.selfId;
  const promote = owner && person.role !== 'owner';
  if (!stop && !promote && !canRemove) return null;
  // `member-menu` stays as a hook for the keyboard handling and smoke tests.
  return (
    <details
      className="member-menu absolute top-1 right-1 z-[2] m-0 flex-none rounded-[7px] bg-[rgb(12_11_16/72%)]"
      data-peer={person.peerId}
    >
      <summary
        className="cursor-pointer list-none p-1 text-[20px] text-[#b9a9cd]"
        aria-label={`Ações de ${person.name}`}
      >
        ···
      </summary>
      <div className="absolute top-7 right-0 z-[3] grid w-[200px] rounded-[8px] border border-line bg-raised p-[5px] shadow-[0_8px_25px_rgb(0_0_0/40%)]">
        {stop && (
          <button
            className={MENU_BUTTON}
            data-action="stop-publication"
            data-peer={person.peerId}
          >
            Encerrar tela de {person.name}
          </button>
        )}
        {promote && (
          <button
            className={MENU_BUTTON}
            data-action="set-moderator"
            data-peer={person.peerId}
            data-enabled={String(person.role !== 'moderator')}
          >
            {person.role === 'moderator'
              ? 'Retirar moderação de'
              : 'Tornar moderador'}{' '}
            {person.name}
          </button>
        )}
        {canRemove && (
          <button
            className={`${MENU_BUTTON} danger-text`}
            data-action="kick"
            data-peer={person.peerId}
            aria-label={`Remover ${person.name} da sala`}
          >
            Remover da sala
          </button>
        )}
      </div>
    </details>
  );
}

/** Photo or initial filling a participant card. */
function CardAvatar(props: { url?: string; name: string; live?: boolean }) {
  return (
    <span
      className={`avatar absolute inset-0 grid size-full place-items-center rounded-[inherit] border-0 text-[24px] text-text ${props.live ? 'outline-1 outline-offset-2 outline-[#89c6b0] outline-solid' : ''}`}
    >
      {props.url ? (
        <img
          className="block size-full rounded-[inherit] object-cover"
          src={props.url}
          alt=""
        />
      ) : (
        props.name.charAt(0).toLocaleUpperCase('pt-BR')
      )}
    </span>
  );
}

function CardMedia(props: {
  selected?: boolean;
  avatar: ReactNode;
  name: string;
  status: string;
}) {
  // `participant-card-media` and `participant-card-caption` stay as hooks for
  // the photo preview and the smoke tests.
  return (
    <span
      className={`participant-card-media relative block aspect-[4/3] w-full overflow-hidden rounded-[inherit] border bg-raised ${props.selected ? 'border-[#b8a0ff] shadow-[0_0_0_1px_#b8a0ff]' : 'border-line'}`}
    >
      {props.avatar}
      <span className="participant-card-caption absolute inset-x-0 bottom-0 grid gap-0.5 bg-[linear-gradient(transparent,rgb(0_0_0/82%))] px-2 pt-5 pb-[7px] text-white">
        <strong className="truncate text-[12px] leading-4 font-semibold">
          {props.name}
        </strong>
        <small className="truncate text-[9px] leading-3 text-[rgb(255_255_255/76%)]">
          {props.status}
        </small>
      </span>
    </span>
  );
}

const CARD = 'participant-card relative min-w-0 rounded-[12px]';
const CARD_BUTTON =
  'block w-full cursor-pointer overflow-hidden rounded-[inherit] border-0 bg-transparent p-0 text-left text-inherit disabled:cursor-not-allowed';

function PeopleGroup(props: {
  title: string;
  following: boolean;
  children: ReactNode;
}) {
  return (
    <div className={props.following ? 'mt-5 border-t border-line pt-4' : ''}>
      <h3 className="mx-0 mt-0 mb-2.5 text-[11px] leading-4 font-medium tracking-[0.04em] text-muted uppercase">
        {props.title}
      </h3>
      <div className="grid grid-cols-2 gap-2.5">{props.children}</div>
    </div>
  );
}

/** The participant list is the only place to choose a live publication. */
export function Stage(view: StageViewProps) {
  const { state } = view;
  const avatarUrl = (person: Person) =>
    view.avatarUrl ? view.avatarUrl(person) : person.avatar;
  const self = state.participants.find(
    (person) => person.peerId === state.selfId,
  )!;
  const owner = state.ownerId === state.selfId;
  const moderate = owner || self.role === 'moderator';
  const selected = state.publications.find(
    (publication) => publication.publicationId === view.watching,
  );
  const selectedPerson = state.participants.find(
    (person) => person.peerId === selected?.publisherId,
  );
  const showingLocal = !view.watching && view.hasLocal;
  const showingVideo = view.watching ? view.hasRemote : showingLocal;
  const slotsFull =
    state.publications.length >= state.maxPublishers && !view.sharing;
  const receptionStatus = showingLocal
    ? 'Sua prévia · sem som'
    : view.watching
      ? view.recovering || selected?.connected === false
        ? 'Reconectando…'
        : view.hasRemote
          ? `Assistindo a ${selectedPerson?.name ?? 'uma transmissão'}`
          : 'Conectando…'
      : 'Escolha uma tela ao vivo para assistir';
  const publicationOf = (person: Person) =>
    state.publications.find((entry) => entry.publisherId === person.peerId);
  const live = state.participants.filter((person) => publicationOf(person));
  const others = state.participants.filter((person) => !publicationOf(person));
  const menu = (person: Person) => (
    <MemberMenu
      person={person}
      state={state}
      moderate={moderate}
      owner={owner}
    />
  );

  return (
    <>
      {/* `multi-room-header` stays as a hook for the smoke tests. */}
      <section className="multi-room-header mx-0 mt-0 mb-[clamp(16px,3vh,32px)] flex min-h-14 flex-none items-center justify-between gap-4 max-[1000px]:mb-6 max-[1000px]:flex-wrap max-[1000px]:items-start">
        <div>
          <h1 className="m-0 text-[26px] leading-[34px] font-medium tracking-normal">
            {state.name}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            className="button subtle danger-text max-[1050px]:px-2.5 max-[1050px]:py-2 max-[1050px]:text-[9px] max-[1000px]:min-h-10 max-[1000px]:px-3"
            data-action="leave"
          >
            {owner ? 'Encerrar sala' : 'Sair da sala'}
          </button>
        </div>
      </section>
      {/* `multi-room-grid` lets the shell give the stage the full height. */}
      <div className="multi-room-grid grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_clamp(272px,24vw,320px)] items-stretch gap-5 compact:grid-cols-[minmax(0,1fr)_clamp(252px,27vw,280px)] compact:gap-4">
        <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)] items-center gap-5 overflow-hidden">
          <section
            className="grid size-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] gap-4"
            aria-label="Transmissão em destaque"
          >
            <div
              className={`video-stage group/stage relative flex size-full min-h-0 items-center justify-center overflow-hidden rounded-[16px] border-y border-[#292530] ${PAUSED_PREVIEW_NOTE} ${showingVideo ? 'bg-[#0b0b0f]' : 'bg-[#090a0d]'}`}
            >
              {view.watching && view.recovering && view.hasRemote && (
                <VideoReconnecting>
                  Reconectando à transmissão…
                </VideoReconnecting>
              )}
              {showingVideo ? (
                <StreamVideo
                  stream={view.stream}
                  label="Transmissão em destaque"
                />
              ) : (
                <div className="max-w-full p-6 text-center">
                  <DesignIcon
                    name="screenInactive"
                    className="mx-auto mt-0 mb-4"
                  />
                  <h2 className="mx-0 mt-0 mb-3 text-[20px] font-medium tracking-[-0.4px]">
                    {view.issue
                      ? 'Conexão interrompida'
                      : view.watching
                        ? 'Conectando à transmissão…'
                        : 'Nenhuma transmissão selecionada'}
                  </h2>
                  <p className="mx-0 mt-0 mb-[22px] text-[14px] leading-[22px] text-muted">
                    {view.watching
                      ? 'Aguardando o vídeo da transmissão.'
                      : 'Compartilhe sua tela ou escolha uma tela ao vivo.'}
                  </p>
                </div>
              )}
              <DiagnosticsTrigger>
                <DesignIcon name="network" />
              </DiagnosticsTrigger>
              <ReceiveAudioControls {...view.receiveAudio} />
              {view.reconnectingVideo && (
                <VideoReconnecting>Reconectando ao vídeo…</VideoReconnecting>
              )}
            </div>
            <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-[12px] bg-surface p-2">
              <div className="flex min-w-0 items-center px-2">
                <small className="block max-w-[200px] truncate text-[12px] leading-[18px] text-muted">
                  {receptionStatus}
                </small>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <SendAudioToggle
                  {...view.sendAudio}
                  className={TOOLBAR_BUTTON}
                />
                {view.sharing ? (
                  <button
                    className={`button stop-button ${TOOLBAR_BUTTON}`}
                    data-action="stop"
                  >
                    Parar transmissão
                  </button>
                ) : (
                  <button
                    className={`button primary ${TOOLBAR_BUTTON}`}
                    data-action="choose-source"
                    disabled={view.busy || slotsFull}
                  >
                    Compartilhar tela
                  </button>
                )}
                {showingVideo && (
                  <button
                    className={`button subtle icon-button ${TOOLBAR_BUTTON}`}
                    data-action="fullscreen"
                    aria-label="Tela cheia"
                    title="Tela cheia"
                  >
                    <DesignIcon name="expand" />
                  </button>
                )}
              </div>
            </div>
          </section>
          {view.issue && (
            <ConnectionAlert
              action={{ name: 'retry-watching', label: 'Tentar novamente' }}
            >
              {view.issue}
            </ConnectionAlert>
          )}
        </div>
        <aside className="flex min-w-0 flex-col gap-4">
          <section
            className="h-full min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain rounded-[16px] bg-surface p-4 [scrollbar-gutter:stable] [scrollbar-width:thin]"
            aria-label="Pessoas na sala"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="m-0 text-[12px] leading-7 font-medium tracking-[-0.2px]">
                Participantes · {state.participants.length}
              </h2>
              <span className="sr-only">
                Limite de {state.maxParticipants} participantes
              </span>
            </div>
            {state.publications.length > 0 && (
              <PeopleGroup
                title={`Telas ao vivo · ${state.publications.length}`}
                following={false}
              >
                {live.map((person) => {
                  const publication = publicationOf(person)!;
                  const own = person.peerId === state.selfId;
                  const active =
                    publication.publicationId === view.watching ||
                    (own && showingLocal);
                  const reconnecting = !publication.connected;
                  // `live-stream-person` stays as a hook for the smoke tests.
                  return (
                    <div
                      key={person.peerId}
                      className={`${CARD} live-stream-person transition-colors duration-[140ms] ease-[ease]`}
                    >
                      <button
                        className={CARD_BUTTON}
                        data-action={own ? 'preview-own' : 'watch-screen'}
                        data-publication={publication.publicationId}
                        disabled={reconnecting && !active}
                        aria-pressed={active}
                        aria-label={
                          own
                            ? 'Ver minha prévia'
                            : `Assistir transmissão de ${person.name}`
                        }
                        title={
                          own
                            ? 'Mostrar sua prévia'
                            : `Assistir à transmissão de ${person.name}`
                        }
                      >
                        <CardMedia
                          selected={active}
                          avatar={
                            <CardAvatar
                              url={avatarUrl(person)}
                              name={person.name}
                              live={active}
                            />
                          }
                          name={`${person.name}${own ? ' (você)' : ''}`}
                          status={reconnecting ? 'Reconectando…' : 'AO VIVO'}
                        />
                      </button>
                      {menu(person)}
                    </div>
                  );
                })}
              </PeopleGroup>
            )}
            {others.length > 0 && (
              <PeopleGroup
                title="Na sala"
                following={state.publications.length > 0}
              >
                {others.map((person) => (
                  <div key={person.peerId} className={CARD}>
                    <button
                      type="button"
                      className={`participant-photo-open ${CARD_BUTTON}`}
                      aria-label={`Ampliar foto de ${person.name}`}
                    >
                      <CardMedia
                        avatar={
                          <CardAvatar
                            url={avatarUrl(person)}
                            name={person.name}
                          />
                        }
                        name={`${person.name}${person.peerId === state.selfId ? ' (você)' : ''}`}
                        status={
                          !person.connected
                            ? 'Reconectando…'
                            : person.role === 'owner'
                              ? 'Dono da sala'
                              : person.role === 'moderator'
                                ? 'Moderador'
                                : 'Na sala'
                        }
                      />
                    </button>
                    {menu(person)}
                  </div>
                ))}
              </PeopleGroup>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
