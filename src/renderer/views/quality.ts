import {
  FRAME_RATE_OPTIONS,
  QUALITY_PRESETS,
  type StreamPreferences,
} from '../../shared/quality';
import { escapeHtml as escape } from '../ui/components/html';

export interface QualityPanelView {
  preferences: StreamPreferences;
  pendingPreferences: StreamPreferences | null;
  disabled: boolean;
  applying: boolean;
  sharing: boolean;
  status: string;
}

/** One row of mutually exclusive choices; each option is a real radio input. */
function segmented(
  id: string,
  labelId: string,
  options: Array<{ value: string; label: string; checked: boolean }>,
  disabled: boolean,
): string {
  return `<div id="${id}" class="segmented" role="radiogroup" aria-labelledby="${labelId}">${options
    .map(
      (option) =>
        `<label class="segmented-option"><input class="segmented-input" type="radio" id="${id}-${option.value}" name="${id}" value="${option.value}" ${option.checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span>${option.label}</span></label>`,
    )
    .join('')}</div>`;
}

const row = (copy: string, control: string, extra = ''): string =>
  `<div class="settings-row ${extra}"><div class="settings-row-copy">${copy}</div><div class="settings-row-control">${control}</div></div>`;

/** Configurações › Transmissão. Changes apply right away, as before. */
export function renderQualityPanel(view: QualityPanelView): string {
  const selected = view.pendingPreferences ?? view.preferences;
  const disabled = view.disabled || view.applying;
  const profile = QUALITY_PRESETS[selected.preset];
  const fps = selected.fps ?? profile.fps;
  const bitrate = selected.videoBitrateMbps ?? profile.bitrate / 1_000_000;
  const is1080 = selected.preset.startsWith('1080p');
  return `<section class="settings-section transmission-settings" aria-labelledby="settings-quality-heading"><header class="settings-section-heading"><div><h2 id="settings-quality-heading">Transmissão</h2><p>Metas de qualidade para a sua tela. A entrega real depende da máquina e da rede.</p></div><span class="settings-pill">${view.applying ? '<span class="spinner"></span> Aplicando' : view.sharing ? 'Ajuste sem parar' : 'Antes de começar'}</span></header>
  <h3 class="settings-group-title">Imagem</h3><div class="settings-group">${row(
    `<span id="settings-quality-preset-label" class="settings-row-title">Resolução</span><small>${is1080 ? '1920 × 1080' : '1280 × 720'}</small>`,
    segmented(
      'settings-quality-preset',
      'settings-quality-preset-label',
      [
        { value: '720p30', label: '720p', checked: !is1080 },
        { value: '1080p30', label: '1080p', checked: is1080 },
      ],
      disabled,
    ),
  )}${row(
    '<span id="settings-fps-label" class="settings-row-title">Quadros por segundo</span><small>Mais QPS deixa o movimento mais suave.</small>',
    segmented(
      'settings-fps',
      'settings-fps-label',
      FRAME_RATE_OPTIONS.map((option) => ({
        value: String(option),
        label: String(option),
        checked: option === fps,
      })),
      disabled,
    ),
  )}${row(
    '<span id="settings-content-mode-label" class="settings-row-title">O que vai aparecer?</span><small>Prioriza nitidez ou fluidez.</small>',
    segmented(
      'settings-content-mode',
      'settings-content-mode-label',
      [
        {
          value: 'detail',
          label: 'Textos e detalhes',
          checked: selected.content === 'detail',
        },
        {
          value: 'motion',
          label: 'Vídeos e jogos',
          checked: selected.content === 'motion',
        },
      ],
      disabled,
    ),
  )}${row(
    '<label class="settings-row-title" for="settings-preferred-codec">Formato de vídeo</label><small>Vale a partir da próxima transmissão.</small>',
    `<select id="settings-preferred-codec" class="settings-select" ${disabled ? 'disabled' : ''}>${['auto', 'H264', 'VP8', 'VP9', 'AV1'].map((codec) => `<option value="${codec}" ${(selected.preferredCodec ?? 'auto') === codec ? 'selected' : ''}>${codec === 'auto' ? 'Automático' : codec}</option>`).join('')}</select>`,
  )}</div>
  <h3 class="settings-group-title">Rede</h3><div class="settings-group">${row(
    '<label class="settings-row-title" for="settings-adaptive-quality">Ajustar à conexão</label><small>Reduz quando necessário e recupera aos poucos.</small>',
    `<input id="settings-adaptive-quality" class="switch" type="checkbox" role="switch" ${selected.adaptive ? 'checked' : ''} ${disabled ? 'disabled' : ''}>`,
  )}${row(
    '<label class="settings-row-title" for="settings-upload-budget">Limite total de envio</label><small id="settings-upload-budget-help">Dividido entre os espectadores · até 500 Mbps.</small>',
    `<div class="budget-input"><input id="settings-upload-budget" type="number" min="4" max="500" step="1" inputmode="numeric" value="${selected.maxUploadMbps}" aria-describedby="settings-upload-budget-help" ${disabled ? 'disabled' : ''}><span>Mbps</span></div>`,
  )}${row(
    `<label class="settings-row-title" for="settings-video-bitrate">Teto por espectador</label><small id="settings-video-bitrate-help">${selected.videoBitrateMbps ? 'Personalizado' : 'Padrão do perfil'} · ${(bitrate / 8).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} MB/s por espectador, no máximo · até 100 Mbps.</small>`,
    `<div class="budget-input"><input id="settings-video-bitrate" type="number" min="1" max="100" step="1" value="${bitrate}" aria-describedby="settings-video-bitrate-help" ${disabled ? 'disabled' : ''}><span>Mbps</span></div>`,
  )}</div>
  <p class="quality-status" role="status">${escape(view.status)}</p></section>`;
}
