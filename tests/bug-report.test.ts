import {
  createServer as createTcpServer,
  type Server as TcpServer,
} from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BUG_REPORT_HEADER,
  BUG_REPORT_PATH,
  MAX_BUG_REPORT_BYTES,
  buildBugReport,
  parseBugReport,
  sanitizeBugReportDescription,
  type BugReport,
} from '../src/shared/bug-report.js';
import { sanitizeDiagnostics } from '../src/shared/diagnostics.js';
import type { LogEvent } from '../src/shared/logs.js';
import {
  createSignalingServer,
  type SignalingOptions,
} from '../src/server/server.js';
import {
  formatBugReportMail,
  type BugReportMail,
  type ReportMailer,
} from '../src/server/report.js';
import {
  buildMimeMessage,
  createResendMailer,
  createSmtpMailer,
  reportMailerFromEnv,
} from '../src/server/report-mailer.js';

const RUN = '0f8fad5b-d9cb-469f-a165-70867728950e';
const record = (index: number, event = 'signal.closed') => ({
  schemaVersion: 1,
  timestamp: `2026-11-14T10:${String(Math.floor(index / 60) % 60).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000Z`,
  runId: RUN,
  event,
  details: { code: 1006, clean: false, version: '0.12.0' },
});

function report(overrides: Partial<BugReport> = {}): BugReport {
  return {
    ...buildBugReport({
      version: '0.12.0',
      createdAt: '2026-11-14T10:00:00.000Z',
      description: 'A sala caiu.',
      logs: { droppedRecords: 0, records: [record(1), record(2)] },
    }),
    ...overrides,
  };
}

describe('Formato do relatório', () => {
  it('remove convites, códigos, endereços e tokens da descrição', () => {
    const text = sanitizeBugReportDescription(
      'Sala ABCD2345 caiu\u0007 em wss://sinal.example.com/ws ' +
        'convite DJG1.AAAAAAAAAAAAAAAAAAAAAA.Grupo ip 10.0.0.12:8787 ' +
        `token ${'a'.repeat(64)}\r\nlinha dois`,
    );
    expect(text).toBe(
      'Sala [removido] caiu em [removido] convite [removido] ip [removido] token [removido]\nlinha dois',
    );
    expect(sanitizeBugReportDescription('ab '.repeat(2000))).toHaveLength(1000);
    expect(sanitizeBugReportDescription(42)).toBe('');
  });

  it('mantém os registros mais recentes dentro do limite de tamanho', () => {
    const records = Array.from({ length: 6000 }, (_, index) => record(index));
    const built = buildBugReport({
      version: '0.12.0',
      logs: { droppedRecords: 3, records },
    });
    expect(built.logs.records.length).toBeLessThanOrEqual(2000);
    expect(built.logs.omittedRecords).toBe(6000 - built.logs.records.length);
    expect(built.logs.records.at(-1)).toEqual(records.at(-1));
    expect(
      new TextEncoder().encode(
        JSON.stringify({ ...built, description: 'é'.repeat(1000) }),
      ).length,
    ).toBeLessThanOrEqual(MAX_BUG_REPORT_BYTES);
    expect(built.logs.droppedRecords).toBe(3);
  });

  it('valida estritamente o relatório recebido', () => {
    const valid = report();
    expect(parseBugReport(JSON.parse(JSON.stringify(valid)))).toEqual(valid);
    expect(parseBugReport({ ...valid, extra: true })).toBeNull();
    expect(parseBugReport({ ...valid, schemaVersion: 2 })).toBeNull();
    expect(parseBugReport({ ...valid, version: '1.0' })).toBeNull();
    expect(
      parseBugReport({ ...valid, description: 'x'.repeat(1001) }),
    ).toBeNull();
    expect(
      parseBugReport({
        ...valid,
        logs: { ...valid.logs, records: [{ ...record(1), event: 'x.y' }] },
      }),
    ).toBeNull();
    expect(
      parseBugReport({
        ...valid,
        logs: { ...valid.logs, records: [{ ...record(1), runId: 'abc' }] },
      }),
    ).toBeNull();
    expect(
      parseBugReport({
        ...valid,
        logs: {
          ...valid.logs,
          records: Array.from({ length: 2001 }, (_, index) => record(index)),
        },
      }),
    ).toBeNull();
    // Unknown detail keys are dropped by the log allowlist, never forwarded.
    const parsed = parseBugReport({
      ...valid,
      description: 'código ABCD2345',
      logs: {
        ...valid.logs,
        records: [
          { ...record(1), details: { code: 1006, sdp: 'v=0', name: 'Ana' } },
        ],
      },
    });
    expect(parsed?.logs.records[0].details).toEqual({ code: 1006 });
    expect(parsed?.description).toBe('código [removido]');
  });

  it('revalida o diagnóstico opcional sem aceitar campos extras', () => {
    const diagnostics = sanitizeDiagnostics(
      {
        preferences: {},
        session: { signaling: 'connected', participants: 2 },
        metrics: [{ direction: 'outbound', fps: 30, route: 'relay' }],
      },
      '0.12.0',
      { platform: 'win32', architecture: 'x64', updateStatus: 'idle' },
    );
    const valid = report({ diagnostics });
    const parsed = parseBugReport(JSON.parse(JSON.stringify(valid)));
    expect(parsed?.diagnostics?.streams).toEqual(diagnostics.streams);
    expect(parsed?.diagnostics?.runtime).toEqual({
      platform: 'win32',
      architecture: 'x64',
      updateStatus: 'idle',
    });
    expect(
      parseBugReport({
        ...valid,
        diagnostics: {
          ...diagnostics,
          streams: [{ ...diagnostics.streams[0], candidate: '10.0.0.1' }],
          runtime: { ...diagnostics.runtime, hostname: 'PC-DA-ANA' },
        },
      })?.diagnostics,
    ).toEqual({
      ...diagnostics,
      runtime: diagnostics.runtime,
    });
    expect(
      parseBugReport({ ...valid, diagnostics: { ...diagnostics, sdp: 'v=0' } }),
    ).toBeNull();
  });

  it('monta o e-mail somente com dados validados', () => {
    const mail = formatBugReportMail(
      report({
        logs: {
          droppedRecords: 0,
          omittedRecords: 0,
          records: [record(1, 'rtc.failed') as BugReport['logs']['records'][0]],
        },
      }),
    );
    expect(mail.subject).toBe('Discorja 0.12.0: relatório de erro');
    expect(mail.text).toContain('A sala caiu.');
    expect(mail.text).toContain('rtc.failed');
    expect(JSON.parse(mail.attachment.content).version).toBe('0.12.0');
    expect(mail.attachment.filename).toMatch(
      /^discorja-relatorio-[\w-]+\.json$/,
    );
  });
});

const services: ReturnType<typeof createSignalingServer>[] = [];
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close()));
});

class FakeMailer implements ReportMailer {
  readonly kind = 'fake';
  readonly sent: BugReportMail[] = [];
  fail = false;
  hold?: Promise<void>;
  async send(mail: BugReportMail) {
    await this.hold;
    if (this.fail) throw Object.assign(new Error('x'), { code: 'ETIMEDOUT' });
    this.sent.push(mail);
  }
}

async function start(options: SignalingOptions = {}) {
  const service = createSignalingServer(options);
  services.push(service);
  await new Promise<void>((resolve) =>
    service.server.listen(0, '127.0.0.1', resolve),
  );
  const address = service.server.address();
  if (!address || typeof address === 'string') throw new Error('Sem endereço.');
  return {
    ...service,
    url: `http://127.0.0.1:${address.port}${BUG_REPORT_PATH}`,
  };
}

const post = (
  url: string,
  body: unknown = report(),
  headers: Record<string, string> = {},
) =>
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [BUG_REPORT_HEADER]: '1',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('Rota de relatórios do servidor', () => {
  it('encaminha um relatório válido por e-mail e registra só o resultado', async () => {
    const mailer = new FakeMailer();
    const logs: LogEvent[] = [];
    const { url } = await start({
      reportMailer: mailer,
      onLog: (entry) => logs.push(entry),
    });
    const response = await post(url, report({ description: 'NOME-PRIVADO' }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].text).toContain('NOME-PRIVADO');
    expect(logs).toEqual(
      expect.arrayContaining([
        { event: 'report.sent', details: { statusCode: 202 } },
        {
          event: 'request.received',
          details: {
            channel: 'http',
            operation: 'report',
            method: 'POST',
            statusCode: 202,
          },
        },
      ]),
    );
    expect(JSON.stringify(logs)).not.toContain('NOME-PRIVADO');
  });

  it('responde 503 quando o e-mail não está configurado', async () => {
    const { url } = await start();
    const response = await post(url);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      code: 'REPORTS_DISABLED',
    });
  });

  it('recusa método, cabeçalho, origem, tipo, tamanho e conteúdo inválidos', async () => {
    const mailer = new FakeMailer();
    const { url } = await start({
      reportMailer: mailer,
      reportLimits: { perIp: { max: 100, windowMs: 60_000 } },
    });
    expect((await fetch(url)).status).toBe(405);
    expect((await fetch(url, { method: 'OPTIONS' })).status).toBe(405);
    expect(
      (await post(url, report(), { [BUG_REPORT_HEADER]: '0' })).status,
    ).toBe(400);
    expect(
      (await post(url, report(), { Origin: 'https://site.example' })).status,
    ).toBe(400);
    expect(
      (await post(url, report(), { Origin: 'app://discorja' })).status,
    ).toBe(202);
    expect(
      (await post(url, report(), { 'Content-Type': 'text/plain' })).status,
    ).toBe(400);
    expect((await post(url, '{"schemaVersion":1')).status).toBe(400);
    expect((await post(url, { ...report(), extra: 1 })).status).toBe(400);
    const huge = await post(url, 'x'.repeat(MAX_BUG_REPORT_BYTES + 1));
    expect(huge.status).toBe(413);
    expect(await huge.json()).toEqual({ ok: false, code: 'TOO_LARGE' });
    expect(mailer.sent).toHaveLength(1);
  });

  it('limita relatórios por IP e no total da instância', async () => {
    let time = 0;
    const mailer = new FakeMailer();
    const { url } = await start({
      reportMailer: mailer,
      now: () => time,
      reportLimits: {
        perIp: { max: 2, windowMs: 60_000 },
        global: { max: 3, windowMs: 120_000 },
      },
    });
    expect((await post(url)).status).toBe(202);
    expect((await post(url)).status).toBe(202);
    const limited = await post(url);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    time = 60_000;
    expect((await post(url)).status).toBe(202);
    // The global window still counts the three accepted reports.
    expect((await post(url)).status).toBe(429);
    expect(mailer.sent).toHaveLength(3);
  });

  it('informa falha do provedor sem registrar o conteúdo', async () => {
    const mailer = new FakeMailer();
    mailer.fail = true;
    const logs: LogEvent[] = [];
    const { url } = await start({
      reportMailer: mailer,
      onLog: (entry) => logs.push(entry),
    });
    const response = await post(url);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ ok: false, code: 'SEND_FAILED' });
    expect(logs).toContainEqual({
      event: 'report.failed',
      details: { errorName: 'Error', errorCode: 'ETIMEDOUT', statusCode: 502 },
    });
  });

  it('esquece contadores expirados e termina envios pendentes ao encerrar', async () => {
    let time = 0;
    const mailer = new FakeMailer();
    let release!: () => void;
    mailer.hold = new Promise<void>((resolve) => (release = resolve));
    const service = await start({
      reportMailer: mailer,
      now: () => time,
      maxTrackedIps: 1,
      reportLimits: { perIp: { max: 5, windowMs: 1000 } },
    });
    const pending = post(service.url);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const closed = service.close();
    let closedEarly = false;
    void closed.then(() => (closedEarly = true));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(closedEarly).toBe(false);
    release();
    expect((await pending).status).toBe(202);
    await closed;
    expect(mailer.sent).toHaveLength(1);

    const handler = await start({
      reportMailer: new FakeMailer(),
      now: () => time,
      maxTrackedIps: 1,
      trustProxyHops: 1,
    });
    const from = (ip: string) => ({ 'X-Forwarded-For': ip });
    expect(
      (await post(handler.url, report(), from('203.0.113.1'))).status,
    ).toBe(202);
    // The table holds one address: a second one waits for the window to pass.
    expect(
      (await post(handler.url, report(), from('203.0.113.2'))).status,
    ).toBe(429);
    time += 60 * 60 * 1000;
    expect(
      (await post(handler.url, report(), from('203.0.113.2'))).status,
    ).toBe(202);
  });
});

describe('Envio de e-mail', () => {
  const mail: BugReportMail = {
    subject: 'Discorja 0.12.0: relatório de erro',
    text: 'Descrição\n.linha com ponto',
    attachment: { filename: 'r.json', content: '{"a":1}' },
  };

  it('usa a API HTTPS do Resend sem expor a resposta do provedor', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const mailer = createResendMailer({
      apiKey: 're_test_key_ficticia',
      from: 'onboarding@resend.dev',
      to: 'mantenedor@example.com',
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response('{"id":"1"}', { status: 200 });
      }) as typeof fetch,
    });
    await mailer.send(mail);
    expect(calls[0].url).toBe('https://api.resend.com/emails');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.to).toEqual(['mantenedor@example.com']);
    expect(Buffer.from(body.attachments[0].content, 'base64').toString()).toBe(
      '{"a":1}',
    );

    const failing = createResendMailer({
      apiKey: 're_test_key_ficticia',
      from: 'onboarding@resend.dev',
      to: 'mantenedor@example.com',
      fetch: (async () =>
        new Response('chave re_test_key_ficticia inválida', {
          status: 401,
        })) as unknown as typeof fetch,
    });
    const error = await failing.send(mail).catch((issue: Error) => issue);
    expect(error).toMatchObject({ code: 'FORBIDDEN' });
    expect(String((error as Error).message)).not.toContain('re_test');
  });

  it('conversa com SMTP exigindo STARTTLS antes da autenticação', async () => {
    const transcript: string[] = [];
    let upgraded = false;
    const server: TcpServer = createTcpServer((socket) => {
      let data = false;
      let buffer = '';
      socket.on('error', () => undefined);
      socket.write('220 ok\r\n');
      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        if (data) {
          if (!buffer.endsWith('\r\n.\r\n')) return;
          transcript.push(buffer);
          buffer = '';
          data = false;
          socket.write('250 queued\r\n');
          return;
        }
        let index: number;
        while ((index = buffer.indexOf('\r\n')) >= 0) {
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          transcript.push(line);
          if (line.startsWith('EHLO'))
            socket.write('250-ok\r\n250 STARTTLS\r\n');
          else if (line === 'STARTTLS') socket.write('220 go\r\n');
          else if (line.startsWith('AUTH')) socket.write('235 ok\r\n');
          else if (line === 'DATA') {
            data = true;
            socket.write('354 send\r\n');
          } else if (line === 'QUIT') socket.end('221 bye\r\n');
          else socket.write('250 ok\r\n');
        }
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Sem porta.');
    const { connect } = await import('node:net');
    const mailer = createSmtpMailer({
      host: 'smtp.example.com',
      port: 587,
      user: 'usuario',
      pass: 'senha-ficticia',
      from: 'discorja@example.com',
      to: 'mantenedor@example.com',
      connect: () => connect(address.port, '127.0.0.1'),
      startTls: async (socket) => {
        upgraded = true;
        return socket;
      },
    });
    await mailer.send(mail);
    server.close();
    expect(upgraded).toBe(true);
    expect(transcript.slice(0, 4)).toEqual([
      'EHLO discorja',
      'STARTTLS',
      'EHLO discorja',
      `AUTH PLAIN ${Buffer.from('\0usuario\0senha-ficticia').toString('base64')}`,
    ]);
    expect(transcript).toContain('RCPT TO:<mantenedor@example.com>');
    expect(transcript.find((line) => line.includes('Subject:'))).toContain(
      '=?UTF-8?B?',
    );
  });

  it('monta MIME com anexo em base64', () => {
    const message = buildMimeMessage(
      mail,
      'discorja@example.com',
      'mantenedor@example.com',
    );
    expect(message).toContain(
      'Content-Disposition: attachment; filename="r.json"',
    );
    expect(message).toContain(Buffer.from('{"a":1}').toString('base64'));
    expect(message.split('\r\n').every((line) => line.length <= 998)).toBe(
      true,
    );
  });

  it('lê a configuração REPORT_* sem citar valores nos erros', () => {
    expect(reportMailerFromEnv({}).mailer).toBeUndefined();
    expect(
      reportMailerFromEnv({
        REPORT_TO: 'mantenedor@example.com',
        REPORT_FROM: 'onboarding@resend.dev',
        REPORT_RESEND_API_KEY: 're_test_key_ficticia',
      }).mailer?.kind,
    ).toBe('resend');
    const smtp = reportMailerFromEnv({
      REPORT_TO: 'mantenedor@example.com',
      REPORT_FROM: 'discorja@example.com',
      REPORT_SMTP_HOST: 'smtp.example.com',
      REPORT_SMTP_PORT: '465',
      REPORT_SMTP_USER: 'u',
      REPORT_SMTP_PASS: 'segredo-ficticio',
      REPORT_MAX_PER_DAY: '10',
    });
    expect(smtp.mailer?.kind).toBe('smtp');
    expect(smtp.limits.global.max).toBe(10);
    for (const env of [
      { REPORT_SMTP_HOST: 'smtp.example.com' },
      { REPORT_TO: 'x', REPORT_FROM: 'a@example.com', REPORT_SMTP_HOST: 'h' },
      {
        REPORT_TO: 'a@example.com',
        REPORT_FROM: 'a@example.com',
        REPORT_SMTP_HOST: 'smtp.example.com',
        REPORT_SMTP_PASS: 'segredo-ficticio',
      },
      {
        REPORT_TO: 'a@example.com',
        REPORT_FROM: 'a@example.com',
        REPORT_RESEND_API_KEY: 'segredo ficticio com espaco',
      },
      { REPORT_TO: 'a@example.com', REPORT_FROM: 'a@example.com' },
    ]) {
      const error = (() => {
        try {
          reportMailerFromEnv(env);
        } catch (issue) {
          return issue as Error;
        }
      })();
      expect(error).toBeInstanceOf(Error);
      expect(error!.message).not.toContain('segredo');
    }
  });
});
