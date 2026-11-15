import { randomUUID } from 'node:crypto';
import { connect as netConnect } from 'node:net';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import type { Duplex } from 'node:stream';
import type { BugReportMail, ReportLimits, ReportMailer } from './report.js';
import { DEFAULT_REPORT_LIMITS } from './report.js';

const SEND_TIMEOUT_MS = 20_000;
const ADDRESS =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const HOST = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;

/** Error with a fixed code only: provider answers and secrets never leak into logs. */
class MailError extends Error {
  constructor(readonly code: 'ETIMEDOUT' | 'FORBIDDEN' | 'INVALID_MESSAGE') {
    super('Falha ao enviar o relatório por e-mail.');
    this.name = 'Error';
  }
}

export interface ResendOptions {
  apiKey: string;
  from: string;
  to: string;
  fetch?: typeof fetch;
}

/** Resend HTTP API (HTTPS port 443, available on Render's free plan). */
export function createResendMailer(options: ResendOptions): ReportMailer {
  const request = options.fetch ?? fetch;
  return {
    kind: 'resend',
    async send(mail: BugReportMail) {
      let response: Response;
      try {
        response = await request('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `Discorja <${options.from}>`,
            to: [options.to],
            subject: mail.subject,
            text: mail.text,
            attachments: [
              {
                filename: mail.attachment.filename,
                content: Buffer.from(mail.attachment.content, 'utf8').toString(
                  'base64',
                ),
              },
            ],
          }),
          redirect: 'error',
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
      } catch {
        throw new MailError('ETIMEDOUT');
      }
      // Discard the provider's body: it may echo addresses or the key's name.
      await response.body?.cancel().catch(() => undefined);
      if (!response.ok)
        throw new MailError(
          response.status === 401 || response.status === 403
            ? 'FORBIDDEN'
            : 'INVALID_MESSAGE',
        );
    },
  };
}

export interface SmtpOptions {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
  to: string;
  /** Test seams: open the connection and upgrade it with STARTTLS. */
  connect?: (implicitTls: boolean) => Duplex;
  startTls?: (socket: Duplex) => Promise<Duplex>;
}

const base64Lines = (value: string): string =>
  (
    Buffer.from(value, 'utf8')
      .toString('base64')
      .match(/.{1,76}/g) ?? []
  ).join('\r\n');
const encodedHeader = (value: string): string =>
  `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;

/** MIME message with a text part and the JSON report attached. */
export function buildMimeMessage(
  mail: BugReportMail,
  from: string,
  to: string,
  date = new Date(),
): string {
  const boundary = `discorja-${randomUUID()}`;
  const domain = from.split('@')[1];
  return [
    `From: Discorja <${from}>`,
    `To: <${to}>`,
    `Subject: ${encodedHeader(mail.subject)}`,
    `Date: ${date.toUTCString()}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(mail.text),
    `--${boundary}`,
    `Content-Type: application/json; name="${mail.attachment.filename}"`,
    `Content-Disposition: attachment; filename="${mail.attachment.filename}"`,
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(mail.attachment.content),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

/** Reads SMTP replies (possibly multi-line) from the current socket. */
class ReplyReader {
  private buffer = '';
  private lines: string[] = [];
  private waiting?: () => void;
  private failure?: Error;
  private socket?: Duplex;
  private readonly onData = (chunk: Buffer) => {
    this.buffer += chunk.toString('latin1');
    if (this.buffer.length > 64 * 1024) {
      this.fail(new MailError('INVALID_MESSAGE'));
      return;
    }
    let index: number;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      this.lines.push(this.buffer.slice(0, index).replace(/\r$/, ''));
      this.buffer = this.buffer.slice(index + 1);
    }
    this.waiting?.();
  };
  private readonly onEnd = () => this.fail(new MailError('ETIMEDOUT'));
  attach(socket: Duplex): void {
    this.detach();
    this.socket = socket;
    socket.on('data', this.onData);
    socket.on('error', this.onEnd);
    socket.on('close', this.onEnd);
  }
  detach(): void {
    this.socket?.off('data', this.onData);
    this.socket?.off('error', this.onEnd);
    this.socket?.off('close', this.onEnd);
    this.socket = undefined;
  }
  fail(error: Error): void {
    this.failure ??= error;
    this.waiting?.();
  }
  async reply(): Promise<number> {
    for (;;) {
      if (this.failure) throw this.failure;
      const end = this.lines.findIndex((line) => /^\d{3}(?: |$)/.test(line));
      if (end >= 0) {
        const code = Number(this.lines[end].slice(0, 3));
        this.lines.splice(0, end + 1);
        return code;
      }
      if (this.lines.some((line) => !/^\d{3}[- ]?/.test(line)))
        throw new MailError('INVALID_MESSAGE');
      await new Promise<void>((resolve) => (this.waiting = resolve));
      this.waiting = undefined;
    }
  }
}

/**
 * Minimal SMTP client: implicit TLS on port 465, otherwise STARTTLS is
 * required. Certificates are always verified; plain-text delivery is refused.
 */
export function createSmtpMailer(options: SmtpOptions): ReportMailer {
  const implicitTls = options.port === 465;
  const open =
    options.connect ??
    ((tls: boolean): Duplex =>
      tls
        ? tlsConnect({
            host: options.host,
            port: options.port,
            servername: options.host,
          })
        : netConnect({ host: options.host, port: options.port }));
  const upgrade =
    options.startTls ??
    ((socket: Duplex) =>
      new Promise<Duplex>((resolve, reject) => {
        const secure: TLSSocket = tlsConnect({
          socket: socket as never,
          servername: options.host,
        });
        secure.once('secureConnect', () => resolve(secure));
        secure.once('error', () => reject(new MailError('FORBIDDEN')));
      }));
  return {
    kind: 'smtp',
    async send(mail: BugReportMail) {
      let socket = open(implicitTls);
      const reader = new ReplyReader();
      reader.attach(socket);
      const timer = setTimeout(() => {
        reader.fail(new MailError('ETIMEDOUT'));
        socket.destroy();
      }, SEND_TIMEOUT_MS);
      const command = async (line: string, ...accepted: number[]) => {
        if (line) socket.write(`${line}\r\n`);
        const code = await reader.reply();
        if (!accepted.includes(code))
          throw new MailError(
            code === 530 || code === 535 ? 'FORBIDDEN' : 'INVALID_MESSAGE',
          );
      };
      try {
        await command('', 220);
        await command('EHLO discorja', 250);
        if (!implicitTls) {
          await command('STARTTLS', 220);
          reader.detach();
          socket = await upgrade(socket);
          reader.attach(socket);
          await command('EHLO discorja', 250);
        }
        if (options.user)
          await command(
            `AUTH PLAIN ${Buffer.from(`\0${options.user}\0${options.pass ?? ''}`, 'utf8').toString('base64')}`,
            235,
          );
        await command(`MAIL FROM:<${options.from}>`, 250);
        await command(`RCPT TO:<${options.to}>`, 250, 251);
        await command('DATA', 354);
        const body = buildMimeMessage(mail, options.from, options.to)
          .split('\r\n')
          .map((line) => (line.startsWith('.') ? `.${line}` : line))
          .join('\r\n');
        await command(`${body}\r\n.`, 250);
        socket.write('QUIT\r\n');
      } finally {
        clearTimeout(timer);
        reader.detach();
        socket.end();
        socket.destroy();
      }
    },
  };
}

function integer(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min = 1,
): number {
  const value = env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!/^\d+$/u.test(value) || !Number.isSafeInteger(parsed) || parsed < min)
    throw new Error(`${name} precisa ser um inteiro maior ou igual a ${min}.`);
  return parsed;
}

/**
 * Reads `REPORT_*`. Without `REPORT_TO` reports stay disabled. Error messages
 * name the variable, never its value.
 */
export function reportMailerFromEnv(env: NodeJS.ProcessEnv): {
  mailer?: ReportMailer;
  limits: ReportLimits;
} {
  const names = Object.keys(env).filter(
    (name) => name.startsWith('REPORT_') && env[name],
  );
  const limits: ReportLimits = {
    perIp: {
      max: integer(env, 'REPORT_MAX_PER_IP', DEFAULT_REPORT_LIMITS.perIp.max),
      windowMs: DEFAULT_REPORT_LIMITS.perIp.windowMs,
    },
    global: {
      max: integer(env, 'REPORT_MAX_PER_DAY', DEFAULT_REPORT_LIMITS.global.max),
      windowMs: DEFAULT_REPORT_LIMITS.global.windowMs,
    },
  };
  if (!env.REPORT_TO) {
    if (names.some((name) => !name.startsWith('REPORT_MAX_')))
      throw new Error('Defina REPORT_TO para ativar os relatórios por e-mail.');
    return { limits };
  }
  const to = env.REPORT_TO.trim();
  const from = (env.REPORT_FROM ?? '').trim();
  if (!ADDRESS.test(to) || to.length > 254)
    throw new Error('REPORT_TO precisa ser um endereço de e-mail.');
  if (!ADDRESS.test(from) || from.length > 254)
    throw new Error('REPORT_FROM precisa ser um endereço de e-mail.');
  const apiKey = env.REPORT_RESEND_API_KEY;
  const host = env.REPORT_SMTP_HOST;
  if (apiKey && host)
    throw new Error(
      'Use REPORT_RESEND_API_KEY ou REPORT_SMTP_HOST, não os dois.',
    );
  if (apiKey) {
    if (apiKey.length < 16 || apiKey.length > 256 || /\s/.test(apiKey))
      throw new Error('REPORT_RESEND_API_KEY tem formato inválido.');
    return { mailer: createResendMailer({ apiKey, from, to }), limits };
  }
  if (host) {
    if (!HOST.test(host))
      throw new Error('REPORT_SMTP_HOST precisa ser um nome de servidor.');
    const port = integer(env, 'REPORT_SMTP_PORT', 587);
    if (port > 65535)
      throw new Error('REPORT_SMTP_PORT precisa estar entre 1 e 65535.');
    const user = env.REPORT_SMTP_USER || undefined;
    const pass = env.REPORT_SMTP_PASS || undefined;
    if (!user !== !pass)
      throw new Error(
        'Defina REPORT_SMTP_USER e REPORT_SMTP_PASS juntos, ou nenhum dos dois.',
      );
    return {
      mailer: createSmtpMailer({ host, port, user, pass, from, to }),
      limits,
    };
  }
  throw new Error(
    'Defina REPORT_RESEND_API_KEY ou REPORT_SMTP_HOST para enviar os relatórios.',
  );
}
