import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BugReportModal } from '../src/renderer/views/bug-report.js';
import { Sidebar } from '../src/renderer/views/sidebar.js';
import {
  BugReportDrafts,
  postBugReport,
  reportEndpoint,
} from '../src/electron/bug-report.js';
import { BUG_REPORT_HEADER, buildBugReport } from '../src/shared/bug-report.js';
import { createBugReport } from '../src/renderer/features/bug-report/bug-report.js';
import type { DiscorjaAPI } from '../src/shared/protocol.js';

const report = () =>
  buildBugReport({
    version: '0.12.0',
    createdAt: '2026-11-14T10:00:00.000Z',
    logs: {
      records: [
        {
          schemaVersion: 1,
          timestamp: '2026-11-14T10:00:01.000Z',
          runId: '0f8fad5b-d9cb-469f-a165-70867728950e',
          event: 'rtc.failed',
          details: { connectionState: 'failed' },
        },
      ],
    },
  });

describe('Envio do relatório pelo app', () => {
  it('usa a rota HTTPS do servidor de sinalização configurado', () => {
    expect(reportEndpoint('wss://sinal.example.com/ws?x=1')).toBe(
      'https://sinal.example.com/api/report',
    );
    expect(reportEndpoint('ws://127.0.0.1:8787')).toBe(
      'http://127.0.0.1:8787/api/report',
    );
    expect(() => reportEndpoint('ws://sinal.example.com')).toThrow();
  });

  it('envia exatamente o rascunho mostrado, com a descrição saneada', () => {
    let time = 0;
    const drafts = new BugReportDrafts(() => time);
    const { id, json } = drafts.create(report());
    expect(JSON.parse(json).logs.records).toHaveLength(1);
    expect(drafts.complete('outro', 'x')).toBeNull();
    expect(drafts.complete(id, 'x'.repeat(1001))).toBeNull();
    expect(drafts.complete(id, 42)).toBeNull();
    expect(drafts.complete(id, 'Sala ABCD2345 travou')?.description).toBe(
      'Sala [removido] travou',
    );
    time = 15 * 60 * 1000 + 1;
    expect(drafts.complete(id, 'x')).toBeNull();
  });

  it('traduz as respostas do servidor sem repassar texto livre', async () => {
    const calls: RequestInit[] = [];
    const answer = (status: number, body = '') =>
      (async (_url: string, init: RequestInit) => {
        calls.push(init);
        return new Response(body, { status });
      }) as unknown as typeof fetch;
    expect(
      await postBugReport('https://s/api/report', report(), answer(202)),
    ).toEqual({
      ok: true,
    });
    expect(
      (calls[0].headers as Record<string, string>)[BUG_REPORT_HEADER],
    ).toBe('1');
    const limited = await postBugReport(
      'https://s/api/report',
      report(),
      answer(429, '{"ok":false,"code":"RATE_LIMITED"}'),
    );
    expect(limited).toMatchObject({
      ok: false,
      message: expect.stringContaining('Limite'),
    });
    const odd = await postBugReport(
      'https://s/api/report',
      report(),
      answer(500, '{"code":"<script>"}'),
    );
    expect(odd.ok).toBe(false);
    expect(JSON.stringify(odd)).not.toContain('script');
    const offline = await postBugReport(
      'https://s/api/report',
      report(),
      (async () => {
        throw new Error('ENOTFOUND sinal.example.com');
      }) as unknown as typeof fetch,
    );
    expect(JSON.stringify(offline)).not.toContain('sinal.example.com');
    expect((await postBugReport('https://s/api/report', null)).ok).toBe(false);
  });
});

describe('Fluxo de consentimento', () => {
  function setup(api: Partial<DiscorjaAPI> | undefined) {
    const notices: Array<[string, string | undefined]> = [];
    let open = false;
    const controller = createBugReport({
      api: () => api as DiscorjaAPI | undefined,
      notify: (message, kind) => notices.push([message, kind]),
      render: () => undefined,
      openModal: () => (open = true),
      closeModal: () => (open = false),
      isOpen: () => open,
    });
    return { controller, notices, isOpen: () => open };
  }

  it('só envia depois da prévia e usa o rascunho exibido', async () => {
    const previews: unknown[] = [];
    const sent: Array<[string, string]> = [];
    const { controller, notices, isOpen } = setup({
      previewBugReport: async (diagnostics) => {
        previews.push(diagnostics);
        return { id: `draft-${previews.length}`, json: '{}' };
      },
      sendBugReport: async (id, description) => {
        sent.push([id, description]);
        return { ok: true };
      },
    });
    controller.open({ metrics: [] });
    expect(isOpen()).toBe(true);
    expect(controller.view().status).toBe('loading');
    await controller.send();
    expect(sent).toEqual([]);
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.view().status).toBe('ready');
    controller.setIncludeDiagnostics(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(previews).toEqual([{ metrics: [] }, null]);
    controller.setDescription('Caiu ao trocar de sala');
    // Without the confirmation step nothing is sent.
    await controller.send();
    expect(sent).toEqual([]);
    controller.requestSend();
    expect(controller.view().step).toBe('confirm');
    // The diagnostics choice is frozen while confirming.
    controller.setIncludeDiagnostics(true);
    expect(previews).toHaveLength(2);
    controller.back();
    expect(controller.view()).toMatchObject({ step: 'edit', returned: true });
    expect(sent).toEqual([]);
    controller.requestSend();
    // A second click while the first is in flight sends nothing more.
    const first = controller.send();
    expect(controller.view().status).toBe('sending');
    await controller.send();
    await first;
    expect(sent).toEqual([['draft-2', 'Caiu ao trocar de sala']]);
    expect(isOpen()).toBe(false);
    expect(notices.at(-1)).toEqual([
      'Relatório enviado ao mantenedor por e-mail. Obrigado por ajudar!',
      'success',
    ]);
  });

  it('mantém o diálogo aberto e mostra o erro quando o envio falha', async () => {
    const { controller, notices, isOpen } = setup({
      previewBugReport: async () => ({ id: 'd', json: '{}' }),
      sendBugReport: async () => ({ ok: false, message: 'Limite atingido.' }),
    });
    controller.open(null);
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.requestSend();
    await controller.send();
    expect(isOpen()).toBe(true);
    expect(notices).toEqual([['Limite atingido.', 'error']]);
    expect(controller.view()).toMatchObject({ status: 'ready', step: 'edit' });
  });

  it('não abre sem o aplicativo desktop', () => {
    const { controller, notices, isOpen } = setup(undefined);
    controller.open(null);
    expect(isOpen()).toBe(false);
    expect(notices[0][1]).toBe('info');
  });
});

describe('Diálogo do relatório', () => {
  const base = {
    session: 1,
    status: 'ready' as const,
    returned: false,
    json: '{"version":"0.12.0"}',
    includeDiagnostics: true,
  };
  it('mostra a prévia e só pede confirmação na segunda etapa', () => {
    const edit = renderToStaticMarkup(
      createElement(BugReportModal, { view: { ...base, step: 'edit' } }),
    );
    expect(edit).toContain('data-action="send-bug-report"');
    expect(edit).not.toContain('confirm-bug-report');
    expect(edit).toContain('{&quot;version&quot;:&quot;0.12.0&quot;}');

    const confirm = renderToStaticMarkup(
      createElement(BugReportModal, { view: { ...base, step: 'confirm' } }),
    );
    expect(confirm).toContain('Enviar relatório ao mantenedor?');
    expect(confirm).toContain('data-action="confirm-bug-report"');
    expect(confirm).toContain('data-action="back-bug-report"');
    expect(confirm).not.toContain('data-action="send-bug-report"');
    // The typed description stays mounted (read-only) while confirming.
    expect(confirm).toMatch(/<textarea[^>]*readOnly=""/);

    const sending = renderToStaticMarkup(
      createElement(BugReportModal, {
        view: { ...base, step: 'confirm', status: 'sending' as const },
      }),
    );
    expect(sending).toMatch(
      /<button[^>]*data-action="confirm-bug-report"[^>]*disabled=""[^>]*aria-busy="true"[^>]*>Enviando…<\/button>/,
    );
  });
});

describe('Atalho na barra lateral', () => {
  it('abre o relatório logo acima do perfil, também dentro da sala', () => {
    for (const page of ['home', 'room'] as const) {
      const html = renderToStaticMarkup(
        createElement(Sidebar, {
          page,
          hasRoom: page === 'room',
          groups: [],
          canAddGroup: true,
          displayName: 'Ana',
          profilePhoto: '',
          version: '0.12.0',
          profileMenuOpen: false,
        }),
      );
      const report = html.indexOf('data-action="open-bug-report"');
      expect(report).toBeGreaterThan(html.indexOf('</nav>'));
      expect(report).toBeLessThan(html.indexOf('toggle-profile-menu'));
      expect(html).toContain('aria-label="Enviar relatório de erro"');
      expect(html).toContain('title="Enviar relatório de erro"');
    }
  });
});
