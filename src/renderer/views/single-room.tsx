import type { ReactNode } from 'react';
import type { LegacyRoomState } from '../../shared/protocol';
import { Icon } from '../ui/components/icon';
import {
  ReceiveAudioControls,
  SendAudioToggle,
  type ReceiveAudioControlState,
  type SendAudioControlState,
} from './audio-controls';
import {
  ConnectionAlert,
  DiagnosticsTrigger,
  PAUSED_PREVIEW_NOTE,
  StreamVideo,
  VideoReconnecting,
} from './room-parts';

export interface SingleRoomViewProps {
  room: {
    role: 'host' | 'viewer';
    code: string;
    selfId: string;
    hostId?: string;
    hostName: string;
    maxViewers: number;
  };
  roomState: LegacyRoomState | null;
  /** Your capture when hosting, the host's video when watching. */
  stream: MediaStream | null;
  sharedSourceName: string;
  /** Label under the stage while no video plays (the quality profile). */
  idleSourceLabel: string;
  sharing: boolean;
  remoteSharing: boolean;
  connectionIssue: string;
  /** The signaling connection is recovering while the video plays. */
  reconnectingVideo: boolean;
  busy: boolean;
  displayName: string;
  viewers: Array<{
    id: string;
    name: string;
    connected: boolean;
    failed: boolean;
    reconnecting: boolean;
  }>;
  sendAudio: Omit<SendAudioControlState, 'className'>;
  receiveAudio: ReceiveAudioControlState;
}

// Styles shared by both versions of the single-publisher room.
const HEADER =
  'mx-0 mt-0 mb-8 flex min-h-14 items-center justify-between gap-4 max-[1000px]:mb-6 max-[1000px]:flex-wrap max-[1000px]:items-start';
const TITLE = 'm-0 text-[26px] leading-[34px] font-medium tracking-normal';
const INTRO = 'm-0 text-[11px] text-[#8a839b] max-[860px]:text-[10px]';
const HEADER_BUTTON =
  'button subtle danger-text max-[1050px]:px-2.5 max-[1050px]:py-2 max-[1050px]:text-[9px]';
const GRID =
  'grid min-h-0 grid-cols-[minmax(0,1fr)_237px] items-start gap-[22px] overflow-hidden min-[1350px]:grid-cols-[minmax(0,1fr)_272px] max-[1050px]:grid-cols-[minmax(0,1fr)_210px] max-[1050px]:gap-[15px] max-[860px]:grid-cols-[minmax(0,1fr)_185px] max-[860px]:gap-3';
const PANEL =
  'min-w-0 overflow-hidden rounded-[12px] border border-[#33303e] bg-[#19191f]';
const CONTROL_BUTTON =
  'px-[9px] py-[7px] text-[9px] max-[1050px]:p-1.5 max-[1050px]:text-[8px] [&_.icon]:size-[13px]';
const AVATAR =
  'avatar size-[29px] shrink-0 rounded-[9px] text-[10px] max-[860px]:size-[25px]';

function StatusPill(props: { live: boolean; children: ReactNode }) {
  return (
    <span
      className={`flex items-center gap-[5px] rounded-[5px] border px-[7px] py-[5px] text-[7px] font-[650] tracking-[0.7px] whitespace-nowrap max-[1050px]:p-[5px] max-[1050px]:text-[6px] max-[1050px]:tracking-[0.2px] max-[860px]:text-[5px] ${props.live ? 'border-[#5c3645] bg-[#38252d] text-[#ddb0bb]' : 'border-[#3d3549] bg-[#27222f] text-[#90839f]'}`}
    >
      <i
        className={`size-1 rounded-[50%] ${props.live ? 'bg-[#e7a4b3] shadow-[0_0_0_3px_rgb(208_132_155/7%)]' : 'bg-[#84738e]'}`}
      />
      {props.children}
    </span>
  );
}

function BroadcastHeading(props: {
  initial: string;
  name: ReactNode;
  caption: string;
  status: ReactNode;
}) {
  return (
    <div className="flex h-[74px] items-center justify-between gap-3 px-[19px] py-[15px] max-[1050px]:h-[66px] max-[1050px]:p-3 max-[860px]:px-[9px] max-[860px]:py-2.5">
      <div className="flex min-w-0 items-center gap-2.5 max-[860px]:gap-[7px]">
        <span className="avatar max-[860px]:size-[27px] max-[860px]:rounded-[8px] max-[860px]:text-[10px]">
          {props.initial}
        </span>
        <div>
          <strong className="block max-w-[240px] truncate text-[11px] font-[550] max-[1050px]:max-w-[150px] max-[1050px]:text-[10px] max-[860px]:max-w-[110px] max-[860px]:text-[9px]">
            {props.name}
          </strong>
          <small className="mt-1 block text-[9px] text-[#746b85] max-[1050px]:text-[8px]">
            {props.caption}
          </small>
        </div>
      </div>
      {props.status}
    </div>
  );
}

/** The video area; `video-stage` stays as a hook for the smoke tests. */
function VideoStage(props: {
  stream: MediaStream | null;
  hasVideo: boolean;
  empty: ReactNode;
  receiveAudio: ReceiveAudioControlState;
  reconnectingVideo: boolean;
}) {
  return (
    <div
      className={`video-stage group/stage relative flex aspect-video items-center justify-center overflow-hidden rounded-[16px] border-y border-[#292530] ${PAUSED_PREVIEW_NOTE} ${props.hasVideo ? 'min-h-[240px] bg-[#0b0b0f]' : 'min-h-0 bg-[#090a0d]'}`}
    >
      {props.hasVideo ? (
        <StreamVideo
          stream={props.stream}
          label="Vídeo da tela compartilhada"
        />
      ) : (
        <div className="max-w-full p-6 text-center">{props.empty}</div>
      )}
      <DiagnosticsTrigger>
        <Icon name="network" />
      </DiagnosticsTrigger>
      <ReceiveAudioControls {...props.receiveAudio} />
      {props.reconnectingVideo && (
        <VideoReconnecting>Reconectando ao vídeo…</VideoReconnecting>
      )}
    </div>
  );
}

function EmptyIcon(props: { icon: string; badge?: string }) {
  return (
    <div className="relative mx-auto mt-0 mb-[27px] grid h-[66px] w-[74px] place-items-center rounded-[17px] border border-[#3e334d] bg-[#272132] text-[#aa91cd] shadow-[0_0_0_11px_rgb(48_39_56/15%),0_0_0_22px_rgb(48_39_56/7.5%)]">
      <Icon name={props.icon} className="size-[34px]" />
      {props.badge && (
        <span className="absolute -right-[5px] -bottom-[5px] rounded-[7px] border-[3px] border-[#18151e] bg-[#b9a1e3] p-1 text-[#332744]">
          <Icon name={props.badge} className="size-3" />
        </span>
      )}
    </div>
  );
}

const EMPTY_TITLE = 'mx-0 mt-0 mb-3 text-[20px] font-medium tracking-[-0.4px]';
const EMPTY_TEXT = 'mx-0 mt-0 mb-[22px] text-[14px] leading-[22px] text-muted';

function ChooseSource(props: { disabled: boolean }) {
  return (
    <button
      className="button primary px-[13px] py-[9px] text-[10px] max-[1050px]:p-2 max-[1050px]:text-[9px] max-[860px]:p-[7px] max-[860px]:text-[8px] max-[860px]:[&_.icon]:size-[14px]"
      data-action="choose-source"
      disabled={props.disabled}
    >
      <Icon name="screen" /> Escolher o que compartilhar
    </button>
  );
}

function SourceLabel(props: { label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-[7px] text-[8px] text-[#797082] max-[1050px]:text-[7px] max-[860px]:hidden [&>.icon]:size-[13px]">
      <Icon name="screen" />
      <span className="max-w-[190px] truncate max-[1050px]:max-w-[105px]">
        {props.label}
      </span>
    </span>
  );
}

const CONTROLS =
  'flex min-h-[63px] items-center justify-between gap-3 px-4 py-3 max-[1050px]:min-h-14 max-[1050px]:p-2.5 max-[860px]:justify-center';

function InviteCode(props: { code: string }) {
  return (
    <>
      <div
        className="mx-[-4px] mt-[23px] mb-[21px] flex items-center justify-center [font-family:Consolas,'Courier_New',monospace] text-[26px] tracking-[2px] whitespace-nowrap text-[#ddd0f1] select-none min-[1350px]:text-[31px] min-[1350px]:tracking-[3px] max-[1050px]:text-[23px] max-[860px]:text-[21px] max-[860px]:tracking-[1px]"
        aria-label="Código da sala"
      >
        {props.code.slice(0, 4)}
        <span className="w-3 max-[860px]:w-[9px]" />
        {props.code.slice(4)}
      </div>
      <button
        className="button secondary wide p-2 text-[9px] [&_.icon]:size-[13px]"
        data-action="copy"
      >
        <Icon name="copy" /> Copiar código
      </button>
    </>
  );
}

const INVITE_CARD =
  'rounded-[11px] border border-[#3a304a] bg-[linear-gradient(140deg,#2a2237,#1f1c27)] p-5 min-[1350px]:p-6 max-[1050px]:p-[17px] max-[860px]:px-3 max-[860px]:py-[15px]';
const MINI_HEADING =
  'flex items-center gap-[7px] text-[7px] font-[550] tracking-[1.4px] text-[#a88bcf] [&>.icon]:size-[11px]';
const INVITE_NOTE = 'mt-[11px] block text-center text-[8px] text-[#73647f]';
const PEOPLE_CARD =
  'rounded-[10px] border border-[#2d2936] bg-[#18171e] px-4 py-[18px] max-[1050px]:px-[13px] max-[1050px]:py-4 max-[860px]:px-[11px] max-[860px]:py-[14px]';

function PeopleHeading(props: { title: string; count: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="m-0 text-[12px] leading-7 font-medium tracking-[-0.2px]">
        {props.title}
      </h2>
      <span className="rounded-[4px] bg-[#26212d] px-1.5 py-[3px] text-[9px] text-[#7e708e] max-[860px]:hidden">
        {props.count}
      </span>
    </div>
  );
}

// Consecutive people are separated by a line.
const PERSON =
  'flex min-h-14 min-w-0 flex-wrap items-center gap-3 border-0 py-2 [&+&]:mt-[5px] [&+&]:border-t [&+&]:border-[#28232f] [&+&]:pt-[13px]';
const PERSON_COPY = 'min-w-0 flex-1';
const PERSON_NAME =
  'block truncate text-[15px] leading-6 font-medium [overflow-wrap:anywhere]';
const PERSON_NOTE =
  'mt-[3px] flex items-center gap-1 text-[12px] leading-[18px]';
const YOU = 'text-[8px] font-normal text-muted';
const REMOVE =
  'icon-button size-[22px] text-[#776179] hover:bg-[#442735] hover:text-[#e6a3b7]';

function RoomNote(props: { children: ReactNode }) {
  return (
    <div className="flex gap-2 px-1">
      <Icon name="shield" className="mt-0.5 size-[14px] text-[#65556e]" />
      <p className="m-0 text-[8px] leading-[1.8] text-[#6c5c77] max-[1050px]:text-[7px]">
        {props.children}
      </p>
    </div>
  );
}

function SharingReminder(props: { children: ReactNode }) {
  return (
    <div className="mt-[22px] flex items-center gap-[9px] text-[9px] text-[#a98091] max-[1050px]:text-[8px] [&>.icon]:size-[14px]">
      {props.children}
    </div>
  );
}

/** Puts a link on the developer's name inside a connection message. */
function ConnectionIssue({ issue }: { issue: string }) {
  const developerName = 'DevCordeiroCf';
  const index = issue.indexOf(developerName);
  if (index < 0) return <>{issue}</>;
  return (
    <>
      {issue.slice(0, index)}
      <a
        className="text-inherit underline decoration-[rgb(184_160_255/55%)] underline-offset-3 transition-[color,text-decoration-color] duration-[140ms] ease-[ease] hover:text-text hover:decoration-current focus-visible:outline-offset-3"
        href={`https://github.com/${developerName}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {developerName}
      </a>
      {issue.slice(index + developerName.length)}
    </>
  );
}

/** Rooms from protocol 2: one publisher chosen by the owner. */
function LegacyRoom(props: SingleRoomViewProps & { state: LegacyRoomState }) {
  const { room, state } = props;
  const publisher = room.role === 'host';
  const owner = state.ownerId === room.selfId;
  const self = state.participants.find(
    (member) => member.peerId === room.selfId,
  )!;
  const moderate = owner || self.role === 'moderator';
  const hasVideo = !!props.stream;
  const isLive = publisher ? props.sharing : props.remoteSharing;
  return (
    <>
      <section className={HEADER}>
        <div>
          <span className="eyebrow">
            {owner ? 'SUA SALA' : 'SALA POR CONVITE'}
          </span>
          <h1 className={TITLE}>{state.name}</h1>
          <p className={INTRO}>
            {publisher
              ? 'Você pode escolher uma tela para compartilhar.'
              : `${room.hostName} pode iniciar a transmissão.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className={HEADER_BUTTON} data-action="leave">
            <Icon name="exit" />
            {owner ? 'Encerrar sala' : 'Sair da sala'}
          </button>
        </div>
      </section>
      <div className={GRID}>
        <section
          className={PANEL}
          aria-label={publisher ? 'Compartilhamento de tela' : 'Transmissão'}
        >
          <BroadcastHeading
            initial={room.hostName.charAt(0).toUpperCase()}
            name={publisher ? 'Sua transmissão' : room.hostName}
            caption={
              publisher ? 'Permissão para transmitir' : 'Transmissor da sala'
            }
            status={
              <StatusPill live={isLive}>
                {props.reconnectingVideo
                  ? 'RECONECTANDO'
                  : isLive
                    ? 'AO VIVO'
                    : 'EM ESPERA'}
              </StatusPill>
            }
          />
          <VideoStage
            stream={props.stream}
            hasVideo={hasVideo}
            receiveAudio={props.receiveAudio}
            reconnectingVideo={props.reconnectingVideo}
            empty={
              <>
                <EmptyIcon icon="screen" />
                <h2 className={EMPTY_TITLE}>
                  {publisher
                    ? 'Tudo pronto para compartilhar.'
                    : 'Aguardando a transmissão.'}
                </h2>
                <p className={EMPTY_TEXT}>
                  {publisher
                    ? 'A captura só começa quando você escolhe e inicia.'
                    : 'Uma pessoa transmite por vez nesta versão.'}
                </p>
                {publisher && <ChooseSource disabled={props.busy} />}
              </>
            }
          />
          <div className={CONTROLS}>
            <SourceLabel
              label={
                !hasVideo
                  ? props.idleSourceLabel
                  : publisher && props.sharing
                    ? props.sharedSourceName
                    : 'Tela compartilhada'
              }
            />
            {publisher && props.sharing ? (
              <button
                className={`button stop-button ${CONTROL_BUTTON}`}
                data-action="stop"
              >
                <Icon name="stop" /> Parar de compartilhar
              </button>
            ) : !publisher && hasVideo ? (
              <button
                className={`button subtle ${CONTROL_BUTTON}`}
                data-action="fullscreen"
              >
                <Icon name="expand" /> Tela cheia
              </button>
            ) : null}
            <SendAudioToggle {...props.sendAudio} className={CONTROL_BUTTON} />
          </div>
        </section>
        <aside className="flex min-w-0 flex-col gap-4">
          <section className={INVITE_CARD}>
            <div className={MINI_HEADING}>
              <Icon name="lock" /> SALA POR CONVITE
            </div>
            <InviteCode code={room.code} />
            <small className={INVITE_NOTE}>
              Todos devem usar o mesmo servidor e uma versão compatível.
            </small>
          </section>
          <section className={PEOPLE_CARD}>
            <PeopleHeading
              title="Na sala"
              count={`${state.participants.length}/${state.maxParticipants}`}
            />
            {state.participants.map((member) => {
              const canRemove =
                moderate &&
                member.peerId !== room.selfId &&
                member.role !== 'owner' &&
                (owner || member.role !== 'moderator');
              return (
                <div key={member.peerId} className={PERSON}>
                  <span className={AVATAR}>
                    {member.name.charAt(0).toUpperCase()}
                  </span>
                  <div className={PERSON_COPY}>
                    <strong className={PERSON_NAME}>
                      {member.name}
                      {member.peerId === room.selfId && (
                        <>
                          {' '}
                          <span className={YOU}>(você)</span>
                        </>
                      )}
                    </strong>
                    <small className={`${PERSON_NOTE} text-muted`}>
                      {member.role === 'owner'
                        ? 'Dono da sala'
                        : member.role === 'moderator'
                          ? 'Moderador'
                          : 'Participante'}
                      {member.peerId === state.publisherId
                        ? ' · Pode transmitir'
                        : ''}
                      {!member.connected ? ' · Reconectando' : ''}
                    </small>
                  </div>
                  <div className="flex w-full min-w-0 flex-1 flex-wrap gap-[5px] [&_.button]:px-2 [&_.button]:py-1.5 [&_.button]:text-[9px]">
                    {moderate &&
                      member.connected &&
                      member.peerId !== state.publisherId && (
                        <button
                          className="button subtle"
                          data-action="set-publisher"
                          data-peer={member.peerId}
                          aria-label={`Permitir transmissão de ${member.name}`}
                        >
                          Permitir tela
                        </button>
                      )}
                    {owner && member.role !== 'owner' && (
                      <button
                        className="button subtle"
                        data-action="set-moderator"
                        data-peer={member.peerId}
                        data-enabled={String(member.role !== 'moderator')}
                        aria-label={`${member.role === 'moderator' ? 'Retirar moderação de' : 'Tornar moderador'} ${member.name}`}
                      >
                        {member.role === 'moderator'
                          ? 'Retirar moderação'
                          : 'Moderar'}
                      </button>
                    )}
                    {canRemove && (
                      <button
                        className={REMOVE}
                        data-action="kick"
                        data-peer={member.peerId}
                        aria-label={`Remover ${member.name} da sala`}
                      >
                        <Icon name="close" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
          <RoomNote>
            O dono administra a sala. Autorizar uma tela não inicia a captura.
            Ao sair, o dono encerra esta sala.
          </RoomNote>
        </aside>
      </div>
      {props.connectionIssue && (
        <ConnectionAlert action={{ name: 'rejoin', label: 'Entrar novamente' }}>
          {props.connectionIssue}
        </ConnectionAlert>
      )}
      {publisher && props.sharing && (
        <SharingReminder>Sua tela está sendo transmitida.</SharingReminder>
      )}
    </>
  );
}

/** The first room version: one host shares with up to a few viewers. */
function HostedRoom(props: SingleRoomViewProps) {
  const { room } = props;
  const host = room.role === 'host';
  const hasVideo = !!props.stream;
  const isLive = host ? props.sharing : props.remoteSharing;
  const initial = room.hostName.charAt(0).toLocaleUpperCase('pt-BR') || '?';
  const issue = props.connectionIssue;
  return (
    <>
      <section className={HEADER}>
        <div>
          <span className="eyebrow">
            {host ? 'SUA SALA, SEU MOMENTO' : 'BOM TER VOCÊ POR AQUI'}
          </span>
          <h1 className={TITLE}>{host ? '' : `Sala de ${room.hostName}`}</h1>
          <p className={INTRO}>
            {host
              ? 'Convide seus amigos. O resto acontece junto.'
              : 'Sente, acompanhe e aproveite a companhia.'}
          </p>
        </div>
        <button
          className={`${HEADER_BUTTON} mt-4 self-start max-[860px]:text-[8px]`}
          data-action="leave"
        >
          <Icon name="exit" />
          {host ? 'Encerrar sala' : 'Sair da sala'}
        </button>
      </section>
      <div className={GRID}>
        <section
          className={PANEL}
          aria-label={host ? 'Compartilhamento de tela' : 'Transmissão'}
        >
          <BroadcastHeading
            initial={initial}
            name={host ? 'Sua transmissão' : room.hostName}
            caption={host ? 'Você é o anfitrião' : 'Anfitrião da sala'}
            status={
              <StatusPill live={isLive}>
                {props.reconnectingVideo
                  ? 'RECONECTANDO'
                  : isLive
                    ? host
                      ? 'TRANSMITINDO'
                      : hasVideo
                        ? 'AO VIVO'
                        : 'CONECTANDO'
                    : 'EM ESPERA'}
              </StatusPill>
            }
          />
          <VideoStage
            stream={props.stream}
            hasVideo={hasVideo}
            receiveAudio={props.receiveAudio}
            reconnectingVideo={props.reconnectingVideo}
            empty={
              <>
                <EmptyIcon
                  icon={issue ? 'network' : 'screen'}
                  badge={host ? 'plus' : 'users'}
                />
                <h2 className={EMPTY_TITLE}>
                  {host
                    ? 'Tudo pronto para compartilhar.'
                    : issue
                      ? 'Vamos tentar de novo?'
                      : props.remoteSharing
                        ? 'Preparando a conexão…'
                        : 'O encontro já começou.'}
                </h2>
                <p className={EMPTY_TEXT}>
                  {host ? (
                    <>
                      Escolha uma janela ou uma tela.
                      <br />
                      Seus amigos verão apenas o que você selecionar.
                    </>
                  ) : issue ? (
                    'A conexão entre os computadores precisa de atenção.'
                  ) : props.remoteSharing ? (
                    'Conectando você à tela do anfitrião.'
                  ) : (
                    <>
                      {room.hostName} ainda não está transmitindo.
                      <br />
                      Assim que começar, a tela aparece aqui.
                    </>
                  )}
                </p>
                {host ? (
                  <ChooseSource disabled={props.busy} />
                ) : (
                  <span className="inline-flex items-center gap-[7px] text-[9px] text-[#b59ecc]">
                    {issue ? (
                      <Icon name="alert" />
                    ) : (
                      <span className="size-[5px] animate-waiting-pulse rounded-[50%] bg-[#b098cf]" />
                    )}
                    {issue
                      ? 'Conexão interrompida'
                      : props.remoteSharing
                        ? 'Estabelecendo conexão direta'
                        : 'Aguardando o anfitrião'}
                  </span>
                )}
              </>
            }
          />
          <div className={CONTROLS}>
            <SourceLabel
              label={
                hasVideo
                  ? host
                    ? props.sharedSourceName
                    : 'Tela compartilhada'
                  : props.idleSourceLabel
              }
            />
            {host && props.sharing ? (
              <button
                className={`button stop-button ${CONTROL_BUTTON}`}
                data-action="stop"
              >
                <Icon name="stop" /> Parar de compartilhar
              </button>
            ) : !host && hasVideo ? (
              <button
                className={`button subtle ${CONTROL_BUTTON}`}
                data-action="fullscreen"
              >
                <Icon name="expand" /> Tela cheia
              </button>
            ) : (
              <span className="text-[8px] text-[#655d72] max-[1050px]:hidden max-[860px]:block max-[860px]:text-[7px]">
                {host
                  ? 'A captura só começa com você.'
                  : 'A sala continua aberta.'}
              </span>
            )}
            <SendAudioToggle {...props.sendAudio} className={CONTROL_BUTTON} />
          </div>
        </section>
        <aside className="flex min-w-0 flex-col gap-4">
          <section className={INVITE_CARD}>
            <div className={MINI_HEADING}>
              <Icon name="lock" /> SALA PRIVADA
            </div>
            <h2 className="mx-0 mt-4 mb-2 text-[15px] font-[550] tracking-[-0.2px] max-[1050px]:text-[14px] max-[860px]:text-[13px]">
              {host ? 'Chame quem importa.' : 'Você está na sala.'}
            </h2>
            <p className="m-0 text-[9px] text-[#8e819e]">
              {host
                ? 'Envie o código para seus amigos.'
                : 'Este é o código do seu encontro.'}
            </p>
            <InviteCode code={room.code} />
            <small className={INVITE_NOTE}>
              Todos devem usar o mesmo servidor.
            </small>
          </section>
          <section className={PEOPLE_CARD}>
            <PeopleHeading
              title="Na sala"
              count={
                host
                  ? `${props.viewers.length + 1}/${room.maxViewers + 1}`
                  : 'Você + anfitrião'
              }
            />
            <div className={PERSON}>
              <span className={AVATAR}>{initial}</span>
              <div className={PERSON_COPY}>
                <strong className={PERSON_NAME}>
                  {room.hostName}
                  {host && (
                    <>
                      {' '}
                      <span className={YOU}>(você)</span>
                    </>
                  )}
                </strong>
                <small className={`${PERSON_NOTE} text-muted`}>
                  <span className="inline-block size-[3px] shrink-0 rounded-[50%] bg-[#8dcfb1]" />
                  Anfitrião
                </small>
              </div>
              <span
                className="text-[16px] text-[#b095d8]"
                aria-label="Anfitrião"
              >
                ✦
              </span>
            </div>
            {host ? (
              props.viewers.map((person) => (
                <div key={person.id} className={PERSON}>
                  <span className={`${AVATAR} border-[#3c5d50]`}>
                    {person.name.charAt(0).toLocaleUpperCase('pt-BR')}
                  </span>
                  <div className={PERSON_COPY}>
                    <strong className={PERSON_NAME}>{person.name}</strong>
                    <small
                      className={`${PERSON_NOTE} ${person.failed ? 'text-[#d897a9]' : 'text-muted'}`}
                    >
                      {person.failed
                        ? 'Falha de vídeo · reinicie a transmissão'
                        : !props.sharing
                          ? 'Na sala'
                          : person.connected
                            ? 'Assistindo agora'
                            : 'Conectando ao vídeo…'}
                    </small>
                  </div>
                  <button
                    className={REMOVE}
                    data-action="kick"
                    data-peer={person.id}
                    title={`Remover ${person.name}`}
                    aria-label={`Remover ${person.name} da sala`}
                  >
                    <Icon name="close" />
                  </button>
                </div>
              ))
            ) : (
              <div className={PERSON}>
                <span className={`${AVATAR} border-[#3c5d50]`}>
                  {props.displayName.charAt(0).toLocaleUpperCase('pt-BR')}
                </span>
                <div className={PERSON_COPY}>
                  <strong className={PERSON_NAME}>
                    {props.displayName} <span className={YOU}>(você)</span>
                  </strong>
                  <small className={`${PERSON_NOTE} text-muted`}>
                    Espectador
                  </small>
                </div>
              </div>
            )}
            {host && !props.viewers.length && (
              <div className="mt-[11px] flex flex-col items-center border-t border-dashed border-[#302735] pt-[19px]">
                <Icon name="users" className="size-6 text-[#5a4b68]" />
                <p className="mx-0 mt-2.5 mb-0.5 text-center text-[8px] leading-[1.8] text-[#70617d]">
                  <br />
                  Compartilhe o código para começar.
                </p>
              </div>
            )}
          </section>
          <RoomNote>
            {host
              ? `Até ${room.maxViewers} amigos podem assistir. Cada conexão usa a internet do seu computador.`
              : 'O anfitrião controla a transmissão e pode encerrá-la a qualquer momento.'}
          </RoomNote>
        </aside>
      </div>
      {issue && (
        <ConnectionAlert
          icon
          action={{
            name: 'rejoin',
            label: 'Entrar novamente',
            icon: 'refresh',
          }}
        >
          <ConnectionIssue issue={issue} />
        </ConnectionAlert>
      )}
      {host && props.sharing && (
        <SharingReminder>
          <Icon name="screen" /> Sua tela está sendo transmitida. Tudo que
          aparecer na área escolhida poderá ser visto.
        </SharingReminder>
      )}
    </>
  );
}

export function SingleRoom(props: SingleRoomViewProps) {
  return props.roomState ? (
    <LegacyRoom {...props} state={props.roomState} />
  ) : (
    <HostedRoom {...props} />
  );
}
