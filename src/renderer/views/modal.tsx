import type { ReactNode } from 'react';
import { Icon } from '../ui/components/icon';

/** Sizes shared by the dialogs; each one keeps its own width. */
export const MODAL_BODY =
  'max-h-[calc(100vh-60px)] overflow-y-auto px-[29px] pt-[27px]';

/**
 * Overlay and dialog frame. `modal-overlay` stays as a hook: the participant
 * photo preview checks it to know whether a dialog is open.
 */
export function Modal(props: {
  labelledBy: string;
  /** Width, height and padding of the dialog. */
  className: string;
  overlayClassName?: string;
  overlayScrollKey?: string;
  scrollKey?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`modal-overlay fixed inset-0 z-10 flex items-center justify-center overflow-y-auto bg-[#06050ba8] p-[30px] backdrop-blur-[7px] ${props.overlayClassName ?? ''}`}
      data-scroll-preserve={props.overlayScrollKey}
    >
      <section
        className={`max-w-full rounded-[14px] border border-line bg-surface shadow-[0_30px_100px_#0007] ${props.className}`}
        data-scroll-preserve={props.scrollKey}
        role="dialog"
        aria-modal="true"
        aria-labelledby={props.labelledBy}
      >
        {props.children}
      </section>
    </div>
  );
}

/** Title row with an optional close button. */
export function ModalHeading(props: {
  /** Alignment and spacing below the row. */
  className: string;
  close?: { action: string; label: string };
  children: ReactNode;
}) {
  return (
    <div className={`flex justify-between gap-5 ${props.className}`}>
      {props.children}
      {props.close && (
        <button
          className="icon-button"
          data-action={props.close.action}
          aria-label={props.close.label}
        >
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}

export function ModalTitle(props: { id: string; children: ReactNode }) {
  return (
    <h2
      id={props.id}
      className="mx-0 mt-[10px] mb-0 text-[23px] font-medium tracking-normal"
    >
      {props.children}
    </h2>
  );
}

/** Title of the short confirmations, which have no heading row. */
export function ModalPlainTitle(props: { id: string; children: ReactNode }) {
  return (
    <h2
      id={props.id}
      className="my-[0.83em] text-[1.5em] font-medium tracking-normal"
    >
      {props.children}
    </h2>
  );
}

export function ModalDescription(props: { children: ReactNode }) {
  return (
    <p className="mx-0 mt-4 mb-[22px] text-[10px] leading-[1.8] text-[#92839f]">
      {props.children}
    </p>
  );
}

export function ModalFooter(props: {
  /** Space above and inside the footer. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex items-center justify-end gap-2.5 border-t border-[#393040] [&_.button]:text-[10px] ${props.className ?? 'mt-6 py-5'}`}
    >
      {props.children}
    </div>
  );
}
