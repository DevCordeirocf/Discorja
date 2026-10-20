import type { DiscorjaAPI } from '../../../shared/protocol';
import { errorFields, type LogEventName } from '../../../shared/logs';

export function createRendererLogger(
  api: DiscorjaAPI | undefined,
  getSessionEpoch: () => number,
): (event: LogEventName, details?: Record<string, unknown>) => void {
  return (event, details = {}) => {
    void api
      ?.recordLog({
        event,
        details: { session: getSessionEpoch(), ...details },
      })
      .catch(() => undefined);
  };
}

export function bindRendererErrorLogging(
  recordLog: (event: LogEventName, details?: Record<string, unknown>) => void,
): void {
  window.addEventListener('error', (event) =>
    recordLog('renderer.error', {
      ...errorFields(event.error),
      line: event.lineno,
      column: event.colno,
    }),
  );
  window.addEventListener('unhandledrejection', (event) =>
    recordLog('renderer.rejection', errorFields(event.reason)),
  );
}
