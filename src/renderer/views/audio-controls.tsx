import { liveAudioTracks } from '../features/capture';
import { Icon } from '../ui/components/icon';
import { SyncedInput } from '../ui/components/synced-input';

export interface SendAudioControlState {
  role?: 'host' | 'viewer';
  sharing: boolean;
  localStream: MediaStream | null;
  /** Classes from the toolbar that hosts the button. */
  className: string;
}

export interface ReceiveAudioControlState {
  remoteStream: MediaStream | null;
  multiRoom: boolean;
  localStream: MediaStream | null;
  receiveMuted: boolean;
  receiveVolume: number;
  filteredAudioAvailable: boolean;
}

export function SendAudioToggle(state: SendAudioControlState) {
  if (state.role !== 'host' || !state.sharing) return null;
  const tracks = liveAudioTracks(state.localStream);
  if (!tracks.length) return null;
  const silenced = tracks.every((track) => !track.enabled);
  return (
    <button
      className={`button subtle whitespace-nowrap ${state.className}`}
      data-action="toggle-send-audio"
      aria-pressed={silenced}
      title={
        silenced ? 'Reativar o áudio enviado' : 'Silenciar o áudio enviado'
      }
    >
      {silenced ? 'Ativar áudio' : 'Silenciar áudio'}
    </button>
  );
}

// Revealed while the pointer or focus is on the video (`group/stage`).
const REVEAL =
  'group-hover/stage:pointer-events-auto group-hover/stage:opacity-100 group-focus-within/stage:pointer-events-auto group-focus-within/stage:opacity-100 touch:pointer-events-auto touch:opacity-100';

export function ReceiveAudioControls(state: ReceiveAudioControlState) {
  if (!state.remoteStream || !liveAudioTracks(state.remoteStream).length)
    return null;
  const blocked =
    state.multiRoom &&
    liveAudioTracks(state.localStream).length > 0 &&
    !state.filteredAudioAvailable;
  const muted = state.receiveMuted || blocked || state.receiveVolume === 0;
  const label = blocked
    ? 'A reprodução está bloqueada enquanto o áudio geral do computador é capturado'
    : muted
      ? 'Ativar o áudio da transmissão'
      : 'Silenciar o áudio da transmissão';
  const volumePercent = Math.round(state.receiveVolume * 100);
  return (
    <div
      className={`pointer-events-none absolute right-3 bottom-3 z-[3] flex translate-y-1 items-center gap-0 rounded-[12px] border border-[rgb(255_255_255/12%)] bg-[rgb(16_17_21/88%)] p-[5px] text-text opacity-0 shadow-[0_8px_24px_rgb(0_0_0/24%)] transition-[opacity,translate] duration-160 ease-[ease] group-hover/stage:translate-y-0 group-hover/stage:gap-[7px] group-focus-within/stage:translate-y-0 group-focus-within/stage:gap-[7px] touch:translate-y-0 touch:gap-[7px] motion-reduce:transition-none ${REVEAL}`}
      role="group"
      aria-label="Controles de áudio da transmissão"
    >
      <button
        className="grid size-9 flex-[0_0_36px] cursor-pointer place-items-center rounded-[8px] border-0 bg-transparent p-2 text-text focus-visible:outline-offset-2 enabled:hover:bg-raised disabled:cursor-not-allowed disabled:opacity-55"
        data-action="toggle-receive-audio"
        aria-pressed={!muted}
        aria-label={label}
        title={label}
        disabled={blocked}
      >
        <Icon name={muted ? 'volume-muted' : 'volume'} className="size-5" />
      </button>
      <label className="flex w-0 items-center gap-2 overflow-hidden opacity-0 transition-[width,opacity] duration-[180ms,140ms] ease-[ease] group-hover/stage:w-[136px] group-hover/stage:opacity-100 group-focus-within/stage:w-[136px] group-focus-within/stage:opacity-100 touch:w-[136px] touch:opacity-100 motion-reduce:transition-none">
        <span className="sr-only">Volume da transmissão</span>
        <SyncedInput
          id="receive-volume"
          className="m-0 h-5 w-[94px] cursor-pointer accent-purple focus-visible:outline-offset-2 disabled:cursor-not-allowed"
          type="range"
          min="0"
          max="100"
          step="1"
          value={String(volumePercent)}
          aria-label="Volume da transmissão"
          disabled={blocked}
        />
        <output
          id="receive-volume-value"
          className="min-w-[34px] text-right text-[11px] text-muted tabular-nums"
          htmlFor="receive-volume"
        >
          {volumePercent}%
        </output>
      </label>
    </div>
  );
}
