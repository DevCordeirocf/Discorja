import { QUALITY_PRESETS, type StreamPreferences } from '../../shared/quality';
import { escapeHtml as escape } from '../ui/components/html';

export interface QualityPanelView {
  preferences: StreamPreferences;
  pendingPreferences: StreamPreferences | null;
  disabled: boolean;
  applying: boolean;
  sharing: boolean;
  status: string;
}

export function renderQualityPanel(view: QualityPanelView): string {
  const selected = view.pendingPreferences ?? view.preferences;
  const disabled = view.disabled || view.applying;
  return `<section class="quality-panel" aria-labelledby="quality-heading"><div class="quality-heading"><div><h2 id="quality-heading">Qualidade da transmissão</h2><p>Escolha o perfil desejado. A entrega real aparece nas medições.</p></div><span class="quality-state">${view.applying ? '<span class="spinner"></span> Aplicando' : view.sharing ? 'Ajuste sem parar' : 'Antes de começar'}</span></div>
  <div class="quality-controls"><div class="quality-field"><label for="quality-preset">Perfil desejado</label><select id="quality-preset" ${disabled ? 'disabled' : ''}>${Object.entries(
    QUALITY_PRESETS,
  )
    .map(
      ([id, profile]) =>
        `<option value="${id}" ${id === selected.preset ? 'selected' : ''}>${escape(profile.label)}</option>`,
    )
    .join(
      '',
    )}</select></div><div class="quality-field"><label for="content-mode">O que vai aparecer?</label><select id="content-mode" ${disabled ? 'disabled' : ''}><option value="detail" ${selected.content === 'detail' ? 'selected' : ''}>Textos e detalhes</option><option value="motion" ${selected.content === 'motion' ? 'selected' : ''}>Vídeos e jogos</option></select></div><div class="quality-field"><label for="preferred-codec">Formato na próxima transmissão</label><select id="preferred-codec" ${disabled ? 'disabled' : ''}>${['auto', 'H264', 'VP8', 'VP9', 'AV1'].map((codec) => `<option value="${codec}" ${(selected.preferredCodec ?? 'auto') === codec ? 'selected' : ''}>${codec === 'auto' ? 'Automático' : codec}</option>`).join('')}</select></div><label class="adaptive-control" for="adaptive-quality"><input id="adaptive-quality" type="checkbox" ${selected.adaptive ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span><strong>Ajustar à conexão</strong><small>Reduz quando necessário e recupera aos poucos.</small></span></label><div class="quality-field budget-field"><label for="upload-budget">Limite total de envio · até 500 Mbps</label><div class="budget-input"><input id="upload-budget" type="number" min="4" max="500" step="1" inputmode="numeric" value="${selected.maxUploadMbps}" aria-describedby="upload-budget-help" ${disabled ? 'disabled' : ''}><span>Mbps</span></div></div><div class="quality-field bitrate-field"><label for="video-bitrate">Teto por espectador · até 100 Mbps</label><div class="budget-input"><input id="video-bitrate" type="number" min="1" max="100" step="1" value="${selected.videoBitrateMbps ?? QUALITY_PRESETS[selected.preset].bitrate / 1_000_000}" aria-describedby="video-bitrate-help" ${disabled ? 'disabled' : ''}><span>Mbps</span></div><small id="video-bitrate-help">${selected.videoBitrateMbps ? 'Personalizado' : 'Padrão do perfil'} · ${((selected.videoBitrateMbps ?? QUALITY_PRESETS[selected.preset].bitrate / 1_000_000) / 8).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} MB/s por espectador, no máximo.</small></div></div>
  <p id="upload-budget-help" class="quality-help">O limite total é dividido entre espectadores. O FPS real depende da tela, do computador e da rede.</p><p class="quality-status" role="status">${escape(view.status)}</p></section>`;
}
