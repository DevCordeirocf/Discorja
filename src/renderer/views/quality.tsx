import {
  FRAME_RATE_OPTIONS,
  QUALITY_PRESETS,
  type StreamPreferences,
} from '../../shared/quality';
import {
  GroupTitle,
  ROW_NOTE,
  ROW_TITLE,
  SELECT,
  Segmented,
  SettingsGroup,
  SettingsPill,
  SettingsRow,
  SettingsSection,
  Switch,
  SyncedSelect,
  UnitInput,
} from './settings-parts';

export interface QualityPanelProps {
  preferences: StreamPreferences;
  pendingPreferences: StreamPreferences | null;
  disabled: boolean;
  applying: boolean;
  sharing: boolean;
  status: string;
}

const CODECS = ['auto', 'H264', 'VP8', 'VP9', 'AV1'] as const;

/**
 * Configurações › Transmissão. Changes apply right away: the delegated
 * `change` listener reads these controls (`readQualityControls`) by id.
 */
export function QualityPanel(view: QualityPanelProps) {
  const selected = view.pendingPreferences ?? view.preferences;
  const disabled = view.disabled || view.applying;
  const profile = QUALITY_PRESETS[selected.preset];
  const fps = selected.fps ?? profile.fps;
  const bitrate = selected.videoBitrateMbps ?? profile.bitrate / 1_000_000;
  const is1080 = selected.preset.startsWith('1080p');
  return (
    <SettingsSection
      id="settings-quality-heading"
      className="transmission-settings"
      title="Transmissão"
      description="Metas de qualidade para a sua tela. A entrega real depende da máquina e da rede."
      badge={
        <SettingsPill>
          {view.applying ? (
            <>
              <span className="spinner" /> Aplicando
            </>
          ) : view.sharing ? (
            'Ajuste sem parar'
          ) : (
            'Antes de começar'
          )}
        </SettingsPill>
      }
    >
      <GroupTitle>Imagem</GroupTitle>
      <SettingsGroup>
        <SettingsRow
          copy={
            <>
              <span id="settings-quality-preset-label" className={ROW_TITLE}>
                Resolução
              </span>
              <small className={ROW_NOTE}>
                {is1080 ? '1920 × 1080' : '1280 × 720'}
              </small>
            </>
          }
          control={
            <Segmented
              id="settings-quality-preset"
              labelId="settings-quality-preset-label"
              value={is1080 ? '1080p30' : '720p30'}
              options={[
                { value: '720p30', label: '720p' },
                { value: '1080p30', label: '1080p' },
              ]}
              disabled={disabled}
            />
          }
        />
        <SettingsRow
          copy={
            <>
              <span id="settings-fps-label" className={ROW_TITLE}>
                Quadros por segundo
              </span>
              <small className={ROW_NOTE}>
                {fps > 60
                  ? 'Acima de 60 QPS exige mais da CPU e da GPU; se o jogo perder desempenho, use 60 ou 30.'
                  : 'Mais QPS deixa o movimento mais suave.'}
              </small>
            </>
          }
          control={
            <Segmented
              id="settings-fps"
              labelId="settings-fps-label"
              value={String(fps)}
              options={FRAME_RATE_OPTIONS.map((option) => ({
                value: String(option),
                label: String(option),
              }))}
              disabled={disabled}
            />
          }
        />
        <SettingsRow
          copy={
            <>
              <span id="settings-content-mode-label" className={ROW_TITLE}>
                O que vai aparecer?
              </span>
              <small className={ROW_NOTE}>Prioriza nitidez ou fluidez.</small>
            </>
          }
          control={
            <Segmented
              id="settings-content-mode"
              labelId="settings-content-mode-label"
              value={selected.content}
              options={[
                { value: 'detail', label: 'Textos e detalhes' },
                { value: 'motion', label: 'Vídeos e jogos' },
              ]}
              disabled={disabled}
            />
          }
        />
        <SettingsRow
          copy={
            <>
              <label className={ROW_TITLE} htmlFor="settings-preferred-codec">
                Formato de vídeo
              </label>
              <small className={ROW_NOTE}>
                Automático prefere codificação por hardware quando o sistema
                indica suporte. Vale a partir da próxima transmissão.
              </small>
            </>
          }
          control={
            <SyncedSelect
              id="settings-preferred-codec"
              className={SELECT}
              value={selected.preferredCodec ?? 'auto'}
              disabled={disabled}
            >
              {CODECS.map((codec) => (
                <option key={codec} value={codec}>
                  {codec === 'auto' ? 'Automático' : codec}
                </option>
              ))}
            </SyncedSelect>
          }
        />
      </SettingsGroup>
      <GroupTitle>Rede</GroupTitle>
      <SettingsGroup>
        <SettingsRow
          copy={
            <>
              <label className={ROW_TITLE} htmlFor="settings-adaptive-quality">
                Ajustar à conexão
              </label>
              <small className={ROW_NOTE}>
                Reduz quando necessário e recupera aos poucos.
              </small>
            </>
          }
          control={
            <Switch
              id="settings-adaptive-quality"
              checked={selected.adaptive}
              disabled={disabled}
            />
          }
        />
        <SettingsRow
          copy={
            <>
              <label className={ROW_TITLE} htmlFor="settings-upload-budget">
                Limite total de envio
              </label>
              <small id="settings-upload-budget-help" className={ROW_NOTE}>
                Dividido entre os espectadores · até 500 Mbps.
              </small>
            </>
          }
          control={
            <UnitInput
              id="settings-upload-budget"
              min={4}
              max={500}
              numeric
              value={selected.maxUploadMbps}
              describedBy="settings-upload-budget-help"
              disabled={disabled}
            />
          }
        />
        <SettingsRow
          copy={
            <>
              <label className={ROW_TITLE} htmlFor="settings-video-bitrate">
                Teto por espectador
              </label>
              <small id="settings-video-bitrate-help" className={ROW_NOTE}>
                {selected.videoBitrateMbps
                  ? 'Personalizado'
                  : 'Padrão do perfil'}{' '}
                ·{' '}
                {(bitrate / 8).toLocaleString('pt-BR', {
                  maximumFractionDigits: 2,
                })}{' '}
                MB/s por espectador, no máximo · até 100 Mbps.
              </small>
            </>
          }
          control={
            <UnitInput
              id="settings-video-bitrate"
              min={1}
              max={100}
              value={bitrate}
              describedBy="settings-video-bitrate-help"
              disabled={disabled}
            />
          }
        />
      </SettingsGroup>
      <p
        className="m-0 text-[13px] leading-[1.8] text-muted empty:hidden"
        role="status"
      >
        {view.status}
      </p>
    </SettingsSection>
  );
}
