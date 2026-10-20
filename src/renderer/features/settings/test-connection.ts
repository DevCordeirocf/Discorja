import type { DiscorjaAPI } from '../../../shared/protocol';
import { SignalConnection } from '../../transport/signal';

export async function testSignalingConnection(options: {
  api: DiscorjaAPI | undefined;
  settingUrl: string;
  busy: boolean;
  inRoom: boolean;
  testing: boolean;
  setTesting: (value: boolean) => void;
  setConnectionCheck: (value: string) => void;
  getSettingUrl: () => string;
  render: () => void;
  notify: (message: string, kind: 'error') => void;
}): Promise<void> {
  const {
    api,
    settingUrl,
    busy,
    inRoom,
    testing,
    setTesting,
    setConnectionCheck,
    getSettingUrl,
    render,
    notify,
  } = options;
  if (!api || busy || inRoom || testing) return;
  let candidate: URL;
  try {
    candidate = new URL(settingUrl.trim());
    if (
      !['ws:', 'wss:'].includes(candidate.protocol) ||
      (candidate.protocol === 'ws:' &&
        !['127.0.0.1', 'localhost'].includes(candidate.hostname)) ||
      candidate.username ||
      candidate.password ||
      candidate.hash
    )
      throw Error();
  } catch {
    notify(
      'Use wss:// para servidores públicos ou ws://127.0.0.1:8787 para o servidor local.',
      'error',
    );
    return;
  }
  const testedUrl = settingUrl;
  setTesting(true);
  setConnectionCheck('Testando…');
  render();
  const probe = new SignalConnection(
    candidate.toString(),
    () => undefined,
    () => undefined,
  );
  try {
    await probe.connect(5_000);
    if (getSettingUrl() === testedUrl)
      setConnectionCheck('Servidor disponível');
  } catch {
    if (getSettingUrl() === testedUrl) setConnectionCheck('Conexão falhou');
  } finally {
    probe.disconnect();
    setTesting(false);
    render();
  }
}
