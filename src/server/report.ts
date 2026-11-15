import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  BUG_REPORT_HEADER,
  MAX_BUG_REPORT_BYTES,
  parseBugReport,
  type BugReport,
  type BugReportErrorCode,
} from '../shared/bug-report.js';
import { errorFields, type LogEvent } from '../shared/logs.js';
import type { RateLimit } from './config.js';

/** One e-mail with the report attached; built only from validated data. */
export interface BugReportMail {
  subject: string;
  text: string;
  attachment: { filename: string; content: string };
}

export interface ReportMailer {
  /** `resend` or `smtp`; only used in startup messages. */
  readonly kind: string;
  send(mail: BugReportMail): Promise<void>;
}

export interface ReportLimits {
  /** Reports accepted from one IP address. */
  perIp: RateLimit;
  /** Reports forwarded by the whole instance; protects the free mail quota. */
  global: RateLimit;
}

export const DEFAULT_REPORT_LIMITS: ReportLimits = {
  perIp: { max: 3, windowMs: 60 * 60 * 1000 },
  global: { max: 50, windowMs: 24 * 60 * 60 * 1000 },
};

const LOGGED_EVENTS = 12;

/** Plain-text summary; the full report travels as the JSON attachment. */
export function formatBugReportMail(report: BugReport): BugReportMail {
  const errors = report.logs.records
    .filter((record) =>
      /(?:failed|error|rejection|rejected|exception|gone|unresponsive|closed)$/.test(
        record.event,
      ),
    )
    .slice(-LOGGED_EVENTS)
    .map(
      (record) =>
        `- ${record.timestamp} ${record.event}${
          record.details && Object.keys(record.details).length
            ? ` ${JSON.stringify(record.details)}`
            : ''
        }`,
    );
  const runtime = report.diagnostics?.runtime ?? {};
  const text = [
    `Relatório de erro do Discorja ${report.version}`,
    `Criado em: ${report.createdAt}`,
    runtime.platform
      ? `Sistema: ${runtime.platform} ${runtime.architecture ?? ''}`.trim()
      : '',
    '',
    'Descrição do usuário:',
    report.description || '(sem descrição)',
    '',
    `Registros: ${report.logs.records.length} (omitidos por tamanho: ${report.logs.omittedRecords}, descartados no app: ${report.logs.droppedRecords})`,
    `Diagnóstico incluído: ${report.diagnostics ? 'sim' : 'não'}`,
    '',
    'Últimos eventos de falha:',
    ...(errors.length ? errors : ['(nenhum)']),
    '',
    'O arquivo anexo contém o relatório completo validado pelo servidor.',
  ]
    .filter((line, index, lines) => line !== '' || lines[index - 1] !== '')
    .join('\n');
  return {
    subject: `Discorja ${report.version}: relatório de erro`,
    text,
    attachment: {
      filename: `discorja-relatorio-${report.createdAt.replace(/[:.]/g, '-')}.json`,
      content: JSON.stringify(report, null, 2),
    },
  };
}

interface Counter {
  start: number;
  count: number;
}

/**
 * `POST /api/report`: size-bounded body, per-IP and global limits, strict
 * validation, then one e-mail. Nothing of the body is logged.
 */
export function createReportHandler(options: {
  mailer?: ReportMailer;
  limits: ReportLimits;
  maxTrackedIps: number;
  now: () => number;
  log: (entry: LogEvent) => void;
}) {
  const { mailer, limits, maxTrackedIps, now, log } = options;
  const perIp = new Map<string, Counter>();
  const global: Counter = { start: now(), count: 0 };
  const consume = (counter: Counter, limit: RateLimit): boolean => {
    const time = now();
    if (time - counter.start >= limit.windowMs) {
      counter.start = time;
      counter.count = 0;
    }
    counter.count += 1;
    return counter.count <= limit.max;
  };
  /** Forget addresses whose window has passed. */
  const prune = (): void => {
    const time = now();
    for (const [ip, counter] of perIp)
      if (time - counter.start >= limits.perIp.windowMs) perIp.delete(ip);
  };
  const answer = (
    response: ServerResponse,
    status: number,
    code?: BugReportErrorCode,
    headers: Record<string, string> = {},
  ): void => {
    if (response.headersSent) return;
    // Reports are rare; closing the connection lets shutdown finish promptly.
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      Connection: 'close',
      ...headers,
    });
    response.end(JSON.stringify(code ? { ok: false, code } : { ok: true }));
  };

  function handle(
    request: IncomingMessage,
    response: ServerResponse,
    context: { ip: string; closing: boolean; originAllowed: boolean },
  ): void {
    if (request.method !== 'POST') {
      // No CORS: OPTIONS preflights from web pages are refused here too.
      response.writeHead(405, { Allow: 'POST' });
      response.end();
      request.resume();
      return;
    }
    // Do not keep the body of a refused request; the answer closes the connection.
    const drain = () => request.resume();
    if (context.closing || !mailer) {
      drain();
      answer(response, 503, 'REPORTS_DISABLED');
      return;
    }
    if (
      request.headers[BUG_REPORT_HEADER] !== '1' ||
      !context.originAllowed ||
      !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
        request.headers['content-type'] ?? '',
      )
    ) {
      drain();
      answer(response, 400, 'INVALID_REPORT');
      return;
    }
    const declared = Number(request.headers['content-length']);
    if (
      request.headers['content-length'] !== undefined &&
      (!Number.isSafeInteger(declared) || declared > MAX_BUG_REPORT_BYTES)
    ) {
      drain();
      answer(response, 413, 'TOO_LARGE');
      return;
    }
    let counter = perIp.get(context.ip);
    if (!counter) {
      if (perIp.size >= maxTrackedIps) prune();
      if (perIp.size >= maxTrackedIps) {
        drain();
        answer(response, 429, 'RATE_LIMITED', { 'Retry-After': '3600' });
        return;
      }
      counter = { start: now(), count: 0 };
      perIp.set(context.ip, counter);
    }
    if (!consume(counter, limits.perIp)) {
      drain();
      answer(response, 429, 'RATE_LIMITED', {
        'Retry-After': String(
          Math.max(
            1,
            Math.ceil((counter.start + limits.perIp.windowMs - now()) / 1000),
          ),
        ),
      });
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let rejected = false;
    request.on('data', (chunk: Buffer) => {
      if (rejected) return;
      size += chunk.length;
      if (size > MAX_BUG_REPORT_BYTES) {
        rejected = true;
        chunks.length = 0;
        drain();
        answer(response, 413, 'TOO_LARGE');
        return;
      }
      chunks.push(chunk);
    });
    request.on('error', () => {
      rejected = true;
    });
    request.on('end', () => {
      if (rejected) return;
      let report: BugReport | null = null;
      try {
        report = parseBugReport(
          JSON.parse(
            new TextDecoder('utf-8', { fatal: true }).decode(
              Buffer.concat(chunks),
            ),
          ),
        );
      } catch {
        report = null;
      }
      chunks.length = 0;
      if (!report) {
        answer(response, 400, 'INVALID_REPORT');
        return;
      }
      if (!consume(global, limits.global)) {
        answer(response, 429, 'RATE_LIMITED', { 'Retry-After': '3600' });
        return;
      }
      void mailer.send(formatBugReportMail(report)).then(
        () => {
          log({ event: 'report.sent', details: { statusCode: 202 } });
          answer(response, 202);
        },
        (error: unknown) => {
          log({
            event: 'report.failed',
            details: { ...errorFields(error), statusCode: 502 },
          });
          answer(response, 502, 'SEND_FAILED');
        },
      );
    });
  }

  return {
    handle,
    prune,
    /** Tracked addresses, exposed for the cleanup tests. */
    trackedIps: () => perIp.size,
  };
}
