import {
  normalizePreferences,
  type StreamPreferences,
} from '../../../shared/quality';
import type { RoomPeers } from '../../media/rtc';
import { applyQualityToMedia } from './quality-application';

export async function applyPreferences(
  next: StreamPreferences,
  deps: {
    busy: boolean;
    applying: boolean;
    getRoomRole(): 'host' | 'viewer' | undefined;
    preferences: StreamPreferences;
    getSessionEpoch(): number;
    getCaptureEpoch(): number;
    getQualityEpoch(): number;
    setQualityEpoch(value: number): void;
    getLocalStream(): MediaStream | null;
    getPeers(): RoomPeers | null;
    setPreferences(value: StreamPreferences): void;
    savePreferences(): void;
    setPendingPreferences(value: StreamPreferences | null): void;
    setApplying(value: boolean): void;
    setStatus(value: string): void;
    render(): void;
    notify(message: string, kind: 'error'): void;
  },
): Promise<void> {
  if (
    deps.busy ||
    deps.applying ||
    (deps.getRoomRole() && deps.getRoomRole() !== 'host')
  ) {
    deps.render();
    return;
  }
  const candidate = normalizePreferences(next);
  if (!deps.getRoomRole()) {
    deps.setPreferences(candidate);
    deps.savePreferences();
    deps.render();
    return;
  }
  if (JSON.stringify(candidate) === JSON.stringify(deps.preferences)) {
    deps.render();
    return;
  }
  const previous = { ...deps.preferences };
  const sessionEpoch = deps.getSessionEpoch();
  const captureEpoch = deps.getCaptureEpoch();
  const attempt = deps.getQualityEpoch() + 1;
  deps.setQualityEpoch(attempt);
  const stream = deps.getLocalStream();
  const track = stream?.getVideoTracks()[0];
  const peers = deps.getPeers();
  const current = () =>
    sessionEpoch === deps.getSessionEpoch() &&
    captureEpoch === deps.getCaptureEpoch() &&
    attempt === deps.getQualityEpoch() &&
    deps.getRoomRole() === 'host' &&
    deps.getLocalStream() === stream;

  deps.setPendingPreferences(candidate);
  deps.setApplying(true);
  deps.setStatus(track ? 'Aplicando à transmissão…' : 'Salvando perfil…');
  deps.render();
  try {
    const result = await applyQualityToMedia({
      candidate,
      previous,
      track,
      peers,
      isCurrent: current,
    });
    if (!result || !current()) return;
    if (result.applied) {
      deps.setPreferences(candidate);
      deps.savePreferences();
      deps.setStatus(
        track
          ? 'Perfil aplicado. Confira nas medições o envio para cada amigo.'
          : 'Perfil salvo para o próximo compartilhamento.',
      );
    } else {
      deps.setPreferences(previous);
      deps.setStatus(
        result.rolledBack
          ? 'O perfil anterior foi mantido.'
          : 'Confira a captura informada pelo sistema abaixo.',
      );
      deps.notify(
        result.rolledBack
          ? 'O sistema não aceitou a mudança de qualidade. Mantivemos o perfil anterior e a sala continua aberta.'
          : 'O sistema não confirmou a mudança nem a restauração do perfil. A transmissão continua; confira as medidas reais antes de tentar novamente.',
        'error',
      );
    }
  } finally {
    if (current()) {
      deps.setPendingPreferences(null);
      deps.setApplying(false);
      deps.render();
    }
  }
}
