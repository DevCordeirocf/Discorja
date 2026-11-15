import type { DiscorjaAPI } from '../../../shared/protocol';

type Notify = (message: string, kind?: 'error' | 'info' | 'success') => void;

export interface BugReportView {
  /** Changes on every opening so the description field starts empty. */
  session: number;
  status: 'loading' | 'ready' | 'sending';
  /** `confirm` asks once more before anything is sent. */
  step: 'edit' | 'confirm';
  /** Back from the confirmation: focus returns to "Enviar relatório". */
  returned: boolean;
  /** Exactly what will be sent, apart from the description. */
  json: string;
  includeDiagnostics: boolean;
}

/**
 * Consent flow for "Enviar relatório por e-mail". Nothing leaves the
 * computer until `send`, and only the previewed draft can be sent.
 */
export function createBugReport(deps: {
  api(): DiscorjaAPI | undefined;
  notify: Notify;
  render(): void;
  openModal(): void;
  closeModal(): void;
  isOpen(): boolean;
}) {
  let session = 0;
  let status: BugReportView['status'] = 'loading';
  let json = '';
  let draftId = '';
  let description = '';
  let includeDiagnostics = true;
  let diagnostics: unknown = null;
  let request = 0;
  let step: BugReportView['step'] = 'edit';
  let returned = false;

  async function preview(): Promise<void> {
    const api = deps.api();
    const current = ++request;
    status = 'loading';
    draftId = '';
    deps.render();
    try {
      if (!api) throw new Error('Sem aplicativo desktop.');
      const draft = await api.previewBugReport(
        includeDiagnostics ? diagnostics : null,
      );
      if (current !== request) return;
      draftId = draft.id;
      json = draft.json;
      status = 'ready';
    } catch {
      if (current !== request) return;
      deps.closeModal();
      deps.notify(
        'Não foi possível preparar o relatório. Tente salvar os logs.',
        'error',
      );
    }
    deps.render();
  }

  return {
    view: (): BugReportView => ({
      session,
      status,
      step,
      returned,
      json,
      includeDiagnostics,
    }),
    /** `diagnosticsInput` is the same object "Salvar diagnóstico" exports. */
    open(diagnosticsInput: unknown): void {
      if (!deps.api()) {
        deps.notify(
          'Abra o aplicativo desktop para enviar um relatório.',
          'info',
        );
        return;
      }
      session++;
      description = '';
      includeDiagnostics = true;
      diagnostics = diagnosticsInput;
      json = '';
      step = 'edit';
      returned = false;
      deps.openModal();
      void preview();
    },
    setDescription(value: string): void {
      description = value;
    },
    setIncludeDiagnostics(value: boolean): void {
      if (value === includeDiagnostics || step !== 'edit') return;
      includeDiagnostics = value;
      void preview();
    },
    cancel(): void {
      request++;
      deps.closeModal();
      deps.render();
    },
    /** First click on "Enviar relatório": show the confirmation step. */
    requestSend(): void {
      if (status !== 'ready' || !draftId) return;
      step = 'confirm';
      returned = false;
      deps.render();
    },
    back(): void {
      if (status === 'sending') return;
      step = 'edit';
      returned = true;
      deps.render();
    },
    /** "Confirmar envio": the only path that reaches the network. */
    async send(): Promise<void> {
      const api = deps.api();
      // `sending` also blocks a second click while the first is in flight.
      if (!api || status !== 'ready' || !draftId || step !== 'confirm') return;
      status = 'sending';
      deps.render();
      let result: Awaited<ReturnType<DiscorjaAPI['sendBugReport']>>;
      try {
        result = await api.sendBugReport(draftId, description);
      } catch {
        result = { ok: false, message: 'Não foi possível enviar o relatório.' };
      }
      status = 'ready';
      step = 'edit';
      if (result.ok) {
        if (deps.isOpen()) deps.closeModal();
        deps.notify(
          'Relatório enviado ao mantenedor por e-mail. Obrigado por ajudar!',
          'success',
        );
        return;
      }
      returned = true;
      deps.notify(result.message, 'error');
    },
  };
}

export type BugReportController = ReturnType<typeof createBugReport>;

/** Field and checkbox of the dialog; buttons go through the action router. */
export function bindBugReportFields(
  root: HTMLElement,
  controller: BugReportController,
): void {
  root.addEventListener('input', (event) => {
    const target = event.target;
    if (
      target instanceof HTMLTextAreaElement &&
      target.id === 'bug-report-description'
    )
      controller.setDescription(target.value);
  });
  root.addEventListener('change', (event) => {
    const target = event.target;
    if (
      target instanceof HTMLInputElement &&
      target.id === 'bug-report-diagnostics'
    )
      controller.setIncludeDiagnostics(target.checked);
  });
}
