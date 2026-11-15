import {
  sanitizeDiagnostics,
  type DiagnosticEnvironment,
} from './diagnostics.js';
import { sanitizeLogRecord, type LogRecord } from './logs.js';
import { keys, object } from './validation.js';

/** HTTP route of the signaling service that forwards reports by e-mail. */
export const BUG_REPORT_PATH = '/api/report';
/**
 * Required request header. A web page cannot send a custom header to another
 * origin without a CORS preflight, which the service never approves.
 */
export const BUG_REPORT_HEADER = 'x-discorja-report';
/** Whole JSON body, in bytes. The app trims the oldest records to fit. */
export const MAX_BUG_REPORT_BYTES = 256 * 1024;
export const BUG_REPORT_DESCRIPTION_MAX = 1000;
export const MAX_BUG_REPORT_RECORDS = 2000;
/** Room left for the description when the logs are trimmed for the preview. */
const DESCRIPTION_RESERVE_BYTES = 8 * 1024;

export type BugReportDiagnostics = ReturnType<typeof sanitizeDiagnostics>;

export interface BugReport {
  schemaVersion: 1;
  version: string;
  createdAt: string;
  description: string;
  logs: {
    /** Records the app could not write (see `docs/logs.md`). */
    droppedRecords: number;
    /** Oldest records left out to respect the size limit. */
    omittedRecords: number;
    records: LogRecord[];
  };
  diagnostics?: BugReportDiagnostics;
}

/** Answer codes of `POST /api/report`; never carry free text. */
export type BugReportErrorCode =
  | 'REPORTS_DISABLED'
  | 'RATE_LIMITED'
  | 'INVALID_REPORT'
  | 'TOO_LARGE'
  | 'SEND_FAILED';

const VERSION = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]{1,40})?$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const REMOVED = '[removido]';

/**
 * Free text typed by the user. Control characters are dropped and anything
 * that looks like a group invite, room code, address or token is replaced,
 * because the user may paste it without noticing.
 */
export function sanitizeBugReportDescription(input: unknown): string {
  if (typeof input !== 'string') return '';
  return (
    input
      .slice(0, BUG_REPORT_DESCRIPTION_MAX)
      .replace(/\r\n?/gu, '\n')
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/gu, '')
      .replace(/DJG1\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]*)?/gu, REMOVED)
      .replace(/\b(?:https?|wss?|turns?|stuns?):\/*\S*/giu, REMOVED)
      .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/gu, REMOVED)
      .replace(/\b[A-Za-z0-9+/_-]{32,}={0,2}/gu, REMOVED)
      // Room codes: eight capitals or digits of the invite alphabet.
      .replace(
        /(?<![A-Za-z0-9])[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}(?![A-Za-z0-9])/gu,
        REMOVED,
      )
      .trim()
  );
}

const byteLength = (value: string): number =>
  new TextEncoder().encode(value).length;

/**
 * Assemble a report from data already sanitized by the app, keeping the most
 * recent records that fit in the size limit (with room for a description).
 */
export function buildBugReport(input: {
  version: string;
  description?: string;
  logs: { droppedRecords?: number; records: readonly unknown[] };
  diagnostics?: BugReportDiagnostics;
  createdAt?: string;
}): BugReport {
  const records = input.logs.records
    .map(sanitizeLogRecord)
    .filter((record): record is LogRecord => !!record);
  const droppedRecords =
    Number.isSafeInteger(input.logs.droppedRecords) &&
    Number(input.logs.droppedRecords) >= 0
      ? Number(input.logs.droppedRecords)
      : 0;
  const make = (start: number): BugReport => ({
    schemaVersion: 1,
    version: input.version,
    createdAt: input.createdAt ?? new Date().toISOString(),
    description: sanitizeBugReportDescription(input.description),
    logs: {
      droppedRecords,
      omittedRecords: start,
      records: records.slice(start),
    },
    ...(input.diagnostics ? { diagnostics: input.diagnostics } : {}),
  });
  const budget = MAX_BUG_REPORT_BYTES - DESCRIPTION_RESERVE_BYTES;
  const fits = (start: number) =>
    byteLength(JSON.stringify(make(start))) <= budget;
  // Binary search for the smallest number of omitted (oldest) records.
  let low = Math.max(0, records.length - MAX_BUG_REPORT_RECORDS);
  let high = records.length;
  if (!fits(high))
    throw new Error('Diagnóstico grande demais para o relatório.');
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (fits(middle)) high = middle;
    else low = middle + 1;
  }
  return make(low);
}

const count = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 1e9;

/**
 * Strict validation of a received report. Unknown keys or a record outside the
 * log allowlist reject the whole report instead of being silently dropped.
 */
export function parseBugReport(input: unknown): BugReport | null {
  if (
    !object(input) ||
    !keys(
      input,
      ['schemaVersion', 'version', 'createdAt', 'description', 'logs'],
      ['diagnostics'],
    ) ||
    input.schemaVersion !== 1 ||
    typeof input.version !== 'string' ||
    !VERSION.test(input.version) ||
    typeof input.createdAt !== 'string' ||
    !ISO_TIME.test(input.createdAt) ||
    typeof input.description !== 'string' ||
    input.description.length > BUG_REPORT_DESCRIPTION_MAX
  )
    return null;
  const logs = input.logs;
  if (
    !object(logs) ||
    !keys(logs, ['droppedRecords', 'omittedRecords', 'records']) ||
    !count(logs.droppedRecords) ||
    !count(logs.omittedRecords) ||
    !Array.isArray(logs.records) ||
    logs.records.length > MAX_BUG_REPORT_RECORDS
  )
    return null;
  const records: LogRecord[] = [];
  for (const raw of logs.records) {
    const record = sanitizeLogRecord(raw);
    if (!record) return null;
    records.push(record);
  }
  let diagnostics: BugReportDiagnostics | undefined;
  if (input.diagnostics !== undefined) {
    const value = input.diagnostics;
    if (
      !object(value) ||
      !keys(value, [
        'schemaVersion',
        'version',
        'generatedAt',
        'preferences',
        'session',
        'runtime',
        'streams',
      ]) ||
      value.schemaVersion !== 2 ||
      !object(value.runtime) ||
      !Array.isArray(value.streams)
    )
      return null;
    try {
      // The sanitizer is idempotent: running it again keeps only allowed fields.
      diagnostics = sanitizeDiagnostics(
        {
          preferences: value.preferences,
          session: value.session,
          metrics: value.streams,
        },
        input.version,
        value.runtime as unknown as DiagnosticEnvironment,
      );
    } catch {
      return null;
    }
    if (
      typeof value.generatedAt === 'string' &&
      ISO_TIME.test(value.generatedAt)
    )
      diagnostics.generatedAt = value.generatedAt;
  }
  return {
    schemaVersion: 1,
    version: input.version,
    createdAt: input.createdAt,
    description: sanitizeBugReportDescription(input.description),
    logs: {
      droppedRecords: logs.droppedRecords,
      omittedRecords: logs.omittedRecords,
      records,
    },
    ...(diagnostics ? { diagnostics } : {}),
  };
}
