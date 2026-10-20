import type { DiscorjaAPI } from '../../../shared/protocol';

type Notify = (
  message: string,
  kind?: 'error' | 'info' | 'success',
  temporary?: boolean,
) => void;

export async function exportDiagnostics(
  api: DiscorjaAPI | undefined,
  report: Parameters<DiscorjaAPI['exportDiagnostics']>[0],
  notify: Notify,
): Promise<void> {
  try {
    await api?.exportDiagnostics(report);
  } catch {
    notify('Não foi possível salvar o diagnóstico.', 'error');
  }
}

export async function exportLogs(
  api: DiscorjaAPI | undefined,
  notify: Notify,
): Promise<void> {
  try {
    const saved = await api?.exportLogs();
    if (saved)
      notify(
        'Logs salvos. Eles incluem os eventos anteriores à queda.',
        'success',
      );
  } catch {
    notify(
      'Não foi possível salvar os logs. Confira o espaço em disco e tente novamente.',
      'error',
    );
  }
}
