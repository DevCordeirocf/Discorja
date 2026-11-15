import { randomUUID } from 'node:crypto';
import {
  BUG_REPORT_DESCRIPTION_MAX,
  BUG_REPORT_HEADER,
  BUG_REPORT_PATH,
  parseBugReport,
  sanitizeBugReportDescription,
  type BugReport,
  type BugReportErrorCode,
} from '../shared/bug-report';
import type { BugReportResult } from '../shared/protocol';
import { validateSignalingUrl } from '../shared/signaling-url';

const DRAFT_TTL_MS = 15 * 60 * 1000;
const SEND_TIMEOUT_MS = 30_000;

/** HTTPS address of the report route on the configured signaling service. */
export function reportEndpoint(signalingUrl: string): string {
  const url = new URL(validateSignalingUrl(signalingUrl));
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = BUG_REPORT_PATH;
  url.search = '';
  return url.toString();
}

const MESSAGES: Record<BugReportErrorCode | 'NETWORK' | 'EXPIRED', string> = {
  REPORTS_DISABLED:
    'O servidor de sinalização configurado não aceita relatórios por e-mail.',
  RATE_LIMITED:
    'Limite de relatórios atingido. Tente novamente mais tarde ou salve os logs.',
  INVALID_REPORT:
    'O servidor recusou o relatório. Salve os logs e envie à parte.',
  TOO_LARGE: 'O relatório ficou grande demais. Salve os logs e envie à parte.',
  SEND_FAILED:
    'O servidor não conseguiu enviar o e-mail agora. Tente novamente mais tarde.',
  NETWORK: 'Não foi possível conectar ao servidor de sinalização.',
  EXPIRED: 'A prévia expirou. Abra o relatório novamente.',
};

/**
 * The report previewed by the user is the one sent: the renderer only names
 * the draft and adds the description, so it cannot swap the content.
 */
export class BugReportDrafts {
  private draft?: { id: string; report: BugReport; expiresAt: number };
  constructor(private readonly now: () => number = Date.now) {}
  create(report: BugReport): { id: string; json: string } {
    const id = randomUUID();
    this.draft = { id, report, expiresAt: this.now() + DRAFT_TTL_MS };
    const shown = {
      ...report,
      description:
        '(o texto digitado acima, sem códigos, convites e endereços)',
    };
    return { id, json: JSON.stringify(shown, null, 2) };
  }
  /** Final report for a draft id, or null when unknown or expired. */
  complete(id: unknown, description: unknown): BugReport | null {
    const draft = this.draft;
    if (
      !draft ||
      typeof id !== 'string' ||
      id !== draft.id ||
      this.now() > draft.expiresAt ||
      typeof description !== 'string' ||
      description.length > BUG_REPORT_DESCRIPTION_MAX
    )
      return null;
    return parseBugReport({
      ...draft.report,
      description: sanitizeBugReportDescription(description),
    });
  }
  discard(id: string): void {
    if (this.draft?.id === id) this.draft = undefined;
  }
}

/** POST the report; answers carry only a fixed code, mapped to a message. */
export async function postBugReport(
  endpoint: string,
  report: BugReport | null,
  request: typeof fetch = fetch,
): Promise<BugReportResult> {
  if (!report) return { ok: false, message: MESSAGES.EXPIRED };
  let response: Response;
  try {
    response = await request(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [BUG_REPORT_HEADER]: '1',
      },
      body: JSON.stringify(report),
      redirect: 'error',
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, message: MESSAGES.NETWORK };
  }
  if (response.status === 202) {
    await response.body?.cancel().catch(() => undefined);
    return { ok: true };
  }
  let code: unknown;
  try {
    code = ((await response.json()) as { code?: unknown }).code;
  } catch {
    code = undefined;
  }
  return {
    ok: false,
    message:
      typeof code === 'string' && Object.hasOwn(MESSAGES, code)
        ? MESSAGES[code as BugReportErrorCode]
        : response.status === 404
          ? MESSAGES.REPORTS_DISABLED
          : MESSAGES.SEND_FAILED,
  };
}
