import { useLayoutEffect, useRef } from 'react';
import { BUG_REPORT_DESCRIPTION_MAX } from '../../shared/bug-report';
import type { BugReportView } from '../features/bug-report';
import { SyncedInput } from '../ui/components/synced-input';
import {
  MODAL_BODY,
  Modal,
  ModalDescription,
  ModalFooter,
  ModalHeading,
  ModalTitle,
} from './modal';

/** Moves focus to the button when it appears (step changes keep it visible). */
function FocusedButton(props: {
  focus: boolean;
  className: string;
  action: string;
  disabled?: boolean;
  busy?: boolean;
  label: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (props.focus) ref.current?.focus();
    // Only on mount: later renders must not steal focus.
  }, []);
  return (
    <button
      ref={ref}
      className={props.className}
      data-action={props.action}
      disabled={props.disabled}
      aria-busy={props.busy}
    >
      {props.label}
    </button>
  );
}

/**
 * Consent dialog: shows the exact JSON that will leave the computer, then asks
 * for an explicit confirmation before sending it.
 */
export function BugReportModal({ view }: { view: BugReportView }) {
  const busy = view.status !== 'ready';
  const confirming = view.step === 'confirm';
  return (
    <Modal labelledBy="bug-report-title" className={`w-[600px] ${MODAL_BODY}`}>
      <ModalHeading
        className="items-start"
        close={{ action: 'cancel-bug-report', label: 'Fechar relatório' }}
      >
        <ModalTitle id="bug-report-title">
          Enviar relatório por e-mail
        </ModalTitle>
      </ModalHeading>
      <ModalDescription>
        O relatório vai para o servidor de sinalização configurado, que o
        encaminha por e-mail ao mantenedor do Discorja. Ele contém somente os
        eventos técnicos abaixo: sem nomes, convites, endereços, SDP/ICE ou
        conteúdo da tela. Nada é enviado antes de você confirmar.
      </ModalDescription>
      <label className="field-label" htmlFor="bug-report-description">
        O que aconteceu? (opcional)
      </label>
      {/* Uncontrolled; `key` resets it on each opening. */}
      <textarea
        key={view.session}
        id="bug-report-description"
        className="text-input mt-2 block min-h-[84px] w-full resize-y py-2.5 leading-[1.6]"
        maxLength={BUG_REPORT_DESCRIPTION_MAX}
        aria-describedby="bug-report-description-note"
        placeholder="Ex.: a tela congelou depois de uns 20 minutos assistindo."
        readOnly={confirming}
        disabled={view.status === 'sending'}
      />
      <small
        id="bug-report-description-note"
        className="mt-1.5 block text-[10px] leading-[1.7] text-[#9b87aa]"
      >
        Até {BUG_REPORT_DESCRIPTION_MAX} caracteres. Não cole códigos de sala,
        convites ou senhas; os que forem reconhecidos são removidos
        automaticamente.
      </small>
      <label className="mt-4 flex items-center gap-[9px] text-[12px] leading-[1.6]">
        <SyncedInput
          id="bug-report-diagnostics"
          className="accent-[#b8a0ff]"
          type="checkbox"
          checked={view.includeDiagnostics}
          disabled={busy || confirming}
        />
        Incluir diagnóstico (medições de conexão, versões e sistema)
      </label>
      <details className="mt-4 rounded-[10px] border border-[#34313f] bg-[#17151f]">
        <summary className="cursor-pointer px-[14px] py-2.5 text-[12px] text-[#c8b5d8]">
          Ver o que será enviado
        </summary>
        <pre
          className="m-0 max-h-[240px] overflow-auto border-t border-[#34313f] px-[14px] py-3 text-[10px] leading-[1.6] whitespace-pre text-[#cbbbd6]"
          tabIndex={0}
          aria-label="Conteúdo do relatório"
          aria-busy={view.status === 'loading'}
        >
          {view.status === 'loading' ? 'Preparando o relatório…' : view.json}
        </pre>
      </details>
      {confirming ? (
        <div
          className="mt-6 rounded-[10px] border border-[#5a4a7a] bg-[#211b2c] px-[18px] py-4"
          role="group"
          aria-labelledby="bug-report-confirm-title"
          aria-describedby="bug-report-confirm-text"
        >
          <h3
            id="bug-report-confirm-title"
            className="m-0 text-[14px] font-semibold"
          >
            Enviar relatório ao mantenedor?
          </h3>
          <p
            id="bug-report-confirm-text"
            className="mx-0 mt-1.5 mb-4 text-[11px] leading-[1.7] text-[#b9a8c8]"
          >
            O conteúdo mostrado na prévia
            {view.includeDiagnostics ? ', com o diagnóstico,' : ''} e a sua
            descrição serão enviados por e-mail pelo servidor de sinalização.
            Depois de enviado, o relatório não pode ser desfeito.
          </p>
          <div className="flex items-center justify-end gap-2.5 [&_.button]:text-[10px]">
            <button
              className="button subtle"
              data-action="back-bug-report"
              disabled={view.status === 'sending'}
            >
              Voltar
            </button>
            <FocusedButton
              focus
              className="button primary"
              action="confirm-bug-report"
              disabled={view.status === 'sending'}
              busy={view.status === 'sending'}
              label={
                view.status === 'sending' ? 'Enviando…' : 'Confirmar envio'
              }
            />
          </div>
        </div>
      ) : (
        <ModalFooter>
          <button className="button subtle" data-action="cancel-bug-report">
            Cancelar
          </button>
          <FocusedButton
            focus={view.returned}
            className="button primary"
            action="send-bug-report"
            disabled={busy}
            label="Enviar relatório"
          />
        </ModalFooter>
      )}
    </Modal>
  );
}
