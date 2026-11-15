import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Icon } from '../ui/components/icon';
import { designIconAsset, type DesignIconName } from './design';

/**
 * Added to the video area: a note over a local preview that
 * `syncRoomPreviews` paused while the window is in the background.
 */
export const PAUSED_PREVIEW_NOTE =
  "has-[video[data-preview-suspended]]:after:absolute has-[video[data-preview-suspended]]:after:inset-x-[15px] has-[video[data-preview-suspended]]:after:top-[45%] has-[video[data-preview-suspended]]:after:text-center has-[video[data-preview-suspended]]:after:text-[11px] has-[video[data-preview-suspended]]:after:leading-[1.7] has-[video[data-preview-suspended]]:after:text-[#b5a4c7] has-[video[data-preview-suspended]]:after:content-['Prévia_pausada_em_segundo_plano_·_transmissão_continua']";

/**
 * The room's video. React keeps the same element across renders, so playback
 * and fullscreen survive state updates; the stream is attached only when it
 * changes. `syncRoomPreviews` may still suspend a local preview by clearing
 * `srcObject`, and resumes it on its own.
 */
export function StreamVideo(props: {
  stream: MediaStream | null;
  label: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useLayoutEffect(() => {
    const video = ref.current!;
    if (video.srcObject !== props.stream) {
      video.srcObject = props.stream;
      if (props.stream) void video.play().catch(() => undefined);
    }
  }, [props.stream]);
  useLayoutEffect(() => {
    const video = ref.current!;
    return () => {
      video.srcObject = null;
    };
  }, []);
  return (
    <video
      ref={ref}
      id="stream-video"
      className="absolute block size-full max-w-full object-contain"
      autoPlay
      playsInline
      muted
      aria-label={props.label}
    />
  );
}

export function DesignIcon(props: {
  name: DesignIconName;
  className?: string;
}) {
  const { src, size } = designIconAsset(props.name);
  return (
    <img
      className={`design-icon ${props.className ?? ''}`}
      src={src}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
    />
  );
}

/** Shown on the video while the pointer or focus is on it (`group/stage`). */
export function DiagnosticsTrigger(props: { children: ReactNode }) {
  return (
    <button
      className="pointer-events-none absolute top-3 right-3 z-[2] grid size-10 -translate-y-[3px] place-items-center rounded-[12px] border border-[rgb(255_255_255/12%)] bg-[rgb(25_26_32/88%)] p-2 text-text opacity-0 transition-[opacity,translate,background-color] duration-150 ease-[ease] group-hover/stage:pointer-events-auto group-hover/stage:translate-y-0 group-hover/stage:opacity-100 group-focus-within/stage:pointer-events-auto group-focus-within/stage:translate-y-0 group-focus-within/stage:opacity-100 hover:bg-raised focus-visible:outline-accent focus-visible:outline-offset-2 touch:pointer-events-auto touch:translate-y-0 touch:opacity-100 [&>*]:size-5"
      data-action="show-diagnostics"
      aria-label="Abrir diagnóstico da conexão"
      title="Diagnóstico"
    >
      {props.children}
    </button>
  );
}

export function VideoReconnecting(props: { children: ReactNode }) {
  return (
    <div className="absolute bottom-[15px] left-1/2 z-[1] -translate-x-1/2 rounded-[5px] border border-[#775366] bg-[rgb(59_38_48/92.5%)] px-3 py-2 text-[10px] whitespace-nowrap text-[#e0c1c9]">
      {props.children}
    </div>
  );
}

/** Floating alert about the room connection, with one way to retry. */
export function ConnectionAlert(props: {
  icon?: boolean;
  children: ReactNode;
  action: { name: string; label: string; icon?: string };
}) {
  return (
    <div
      className="fixed bottom-5 left-1/2 z-[1000] m-0 flex w-[min(620px,calc(100vw-32px))] animate-[notice-enter_180ms_ease-out_both] items-center gap-2.5 rounded-[14px] border border-[#5b3d40] bg-[#2e2024] px-4 py-[14px] shadow-[0_16px_48px_rgb(0_0_0/42%)] [transform:translateX(-50%)] max-[1050px]:flex-wrap"
      role="alert"
    >
      {props.icon && (
        <Icon name="alert" className="size-[17px] text-[#d9a0a9]" />
      )}
      <p className="m-0 flex-1 text-[13px] leading-[1.5] text-[#d3aab4]">
        {props.children}
      </p>
      <button
        className="button subtle flex-none px-2.5 py-[7px] text-[12px] max-[1050px]:ml-[27px]"
        data-action={props.action.name}
      >
        {props.action.icon && <Icon name={props.action.icon} />}
        {props.action.label}
      </button>
      <button
        type="button"
        className="button subtle flex-none px-2.5 py-[7px] text-[12px]"
        data-action="open-bug-report"
      >
        Enviar relatório por e-mail
      </button>
    </div>
  );
}
