import type { ReactNode } from 'react';
import type { AppConfig, UpdateState } from '../../shared/protocol';
import { Icon } from '../ui/components/icon';
import { SyncedInput } from '../ui/components/synced-input';
import { logoUrl } from './design';
import {
  GROUP,
  GROUP_WARNING,
  GroupTitle,
  PADDED_GROUP,
  ROW_NOTE,
  ROW_TITLE,
  SettingsGroup,
  SettingsRow,
  SettingsSection,
} from './settings-parts';

export const SETTINGS_SECTIONS = [
  { id: 'perfil', label: 'Perfil', icon: 'user' },
  { id: 'transmissao', label: 'Transmissão', icon: 'screen' },
  { id: 'conexao', label: 'Conexão', icon: 'globe' },
  { id: 'atualizacoes', label: 'Atualizações', icon: 'download' },
  { id: 'diagnostico', label: 'Diagnóstico', icon: 'activity' },
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['id'];

export function isSettingsSection(value: unknown): value is SettingsSection {
  return SETTINGS_SECTIONS.some((section) => section.id === value);
}

export interface SettingsViewProps {
  section: SettingsSection;
  config: AppConfig;
  update: UpdateState;
  serverUrl: string;
  connected: boolean;
  saving: boolean;
  testing: boolean;
  connectionStatus: string;
  /** Where "Voltar" leads: the room in use or Início. */
  backTo: 'room' | 'home';
  /** Unsaved profile or server changes; shows the save bar. */
  dirty: boolean;
  /** A photo is still being converted, so saving waits. */
  photoProcessing: boolean;
  /** Perfil and Transmissão, rendered by their own views. */
  profilePanel: ReactNode;
  qualityPanel: ReactNode;
}

const UPDATE_TEXT: Record<
  UpdateState['status'],
  (update: UpdateState) => string
> = {
  disabled: () => 'Atualizações não configuradas nesta instalação.',
  idle: () => 'Avisamos ao abrir o app quando houver uma nova versão.',
  checking: () => 'Procurando uma nova versão…',
  available: (update) => `Versão ${update.version ?? ''} disponível.`,
  downloading: (update) =>
    `Baixando atualização · ${Math.round(update.percent ?? 0)}%`,
  downloaded: () => 'Atualização pronta. Reinicie para instalar.',
  error: (update) =>
    update.message ?? 'Não foi possível consultar atualizações.',
  current: () => 'Você está na versão mais recente.',
};

const UPDATE_COLOR: Partial<Record<UpdateState['status'], string>> = {
  available: 'text-[#d2c4ff]',
  downloaded: 'text-[#d2c4ff]',
  error: 'text-[#f0a8b8]',
  current: 'text-mint',
};

function ConnectionSection(props: SettingsViewProps) {
  const locked = props.connected || props.saving;
  return (
    <SettingsSection
      id="settings-server-heading"
      title="Conexão"
      description="Todos da sala precisam usar o mesmo servidor."
    >
      <GroupTitle>Servidor de sinalização</GroupTitle>
      <div className={PADDED_GROUP}>
        <label className={ROW_TITLE} htmlFor="signaling-url">
          Endereço
        </label>
        <div className="flex gap-2.5">
          <SyncedInput
            id="signaling-url"
            className="text-input h-[42px] min-w-0 flex-1 bg-[#0f1014] [font-family:Consolas,'Courier_New',monospace]"
            type="url"
            required
            spellCheck={false}
            autoComplete="off"
            placeholder="wss://seu-servidor.exemplo"
            value={props.serverUrl}
            disabled={locked}
          />
          <button
            type="button"
            className="button secondary"
            data-action="test-connection"
            disabled={props.connected || props.testing || props.saving}
          >
            {props.testing ? 'Testando…' : 'Testar conexão'}
          </button>
        </div>
        <span
          className={`shrink-0 self-start rounded-[8px] p-2 text-[12px] leading-[18px] font-medium ${props.connected ? 'bg-[#1d302b] text-mint' : 'bg-raised text-muted'}`}
          role="status"
        >
          {props.connectionStatus}
        </span>
        {props.connected && (
          <p className={GROUP_WARNING}>Saia da sala para alterar o servidor.</p>
        )}
      </div>
    </SettingsSection>
  );
}

function UpdatesSection({ config, update }: SettingsViewProps) {
  const action =
    update.status === 'available' ? (
      <button
        type="button"
        className="button primary"
        data-action="download-update"
      >
        Baixar atualização
      </button>
    ) : update.status === 'downloaded' ? (
      <button
        type="button"
        className="button primary"
        data-action="install-update"
      >
        Reiniciar e instalar
      </button>
    ) : (
      <button
        type="button"
        className="button secondary"
        data-action="check-update"
        disabled={
          !config.updatesConfigured ||
          ['checking', 'downloading'].includes(update.status)
        }
      >
        Verificar atualizações
      </button>
    );
  return (
    <SettingsSection
      id="settings-update-heading"
      title="Atualizações"
      description="Avisamos ao abrir o app quando houver uma nova versão."
    >
      <div
        className={`${GROUP} flex items-center justify-between gap-6 px-6 py-[22px]`}
      >
        <div className="flex min-w-0 items-center gap-4">
          <img
            className="size-12 flex-none object-contain"
            src={logoUrl}
            alt=""
            width="48"
            height="48"
          />
          <div>
            <strong className="block text-[16px]">
              Discorja {config.version}
            </strong>
            <small
              className={`mt-1 block text-[13px] ${UPDATE_COLOR[update.status] ?? 'text-kbd'}`}
              role="status"
            >
              {UPDATE_TEXT[update.status](update)}
            </small>
          </div>
        </div>
        {action}
      </div>
      <SettingsGroup>
        <SettingsRow
          copy={
            <>
              <span className={ROW_TITLE}>Novidades</span>
              <small className={ROW_NOTE}>O que mudou nesta versão.</small>
            </>
          }
          control={
            <button
              type="button"
              className="button secondary"
              data-action="open-whats-new"
            >
              Ver novidades
            </button>
          }
        />
      </SettingsGroup>
    </SettingsSection>
  );
}

function DiagnosticsSection() {
  return (
    <SettingsSection
      id="settings-logs-heading"
      title="Diagnóstico"
      description="Registros para investigar falhas de conexão."
    >
      <SettingsGroup>
        <SettingsRow
          copy={
            <>
              <span className={ROW_TITLE}>Logs de erros</span>
              <small className={ROW_NOTE}>
                Sem convites, tokens, SDP ou conteúdo de tela.
              </small>
            </>
          }
          control={
            <button
              type="button"
              className="button secondary"
              data-action="export-logs"
            >
              Salvar logs
            </button>
          }
        />
        <SettingsRow
          copy={
            <>
              <span className={ROW_TITLE}>Relatório por e-mail</span>
              <small className={ROW_NOTE}>
                Envia os logs ao mantenedor pelo servidor de sinalização, depois
                de mostrar o conteúdo.
              </small>
            </>
          }
          control={
            <button
              type="button"
              className="button secondary"
              data-action="open-bug-report"
            >
              Enviar relatório
            </button>
          }
        />
      </SettingsGroup>
    </SettingsSection>
  );
}

function SettingsContent(props: SettingsViewProps) {
  switch (props.section) {
    case 'perfil':
      return props.profilePanel;
    case 'transmissao':
      return props.qualityPanel;
    case 'conexao':
      return <ConnectionSection {...props} />;
    case 'atualizacoes':
      return <UpdatesSection {...props} />;
    case 'diagnostico':
      return <DiagnosticsSection />;
  }
}

export function SettingsView(props: SettingsViewProps) {
  const back = props.backTo === 'room' ? 'Voltar à sala' : 'Voltar ao Início';
  const updateReady = ['available', 'downloaded'].includes(props.update.status);
  return (
    <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[280px_minmax(0,1fr)] max-[1000px]:grid-cols-[220px_minmax(0,1fr)]">
      <nav
        className="flex min-h-0 flex-col gap-1 overflow-y-auto border-r border-panel-line bg-panel px-[18px] pt-10 pb-[18px] max-[1000px]:px-3 short:pt-8"
        aria-label="Seções das configurações"
      >
        <button
          type="button"
          className="mb-[22px] flex min-h-12 items-center gap-3 rounded-[12px] border border-line bg-control pr-3 pl-1.5 text-left text-[15px] font-medium text-text transition-[background-color,border-color] duration-[140ms] hover:border-control-hover hover:bg-raised motion-reduce:transition-none"
          data-action="close-settings"
          aria-label={`Fechar configurações e ${back.toLocaleLowerCase('pt-BR')}`}
        >
          <span className="grid size-[34px] flex-none place-items-center rounded-[9px] bg-purple text-on-purple">
            <Icon name="back" className="size-[18px] stroke-[2.4]" />
          </span>
          <span className="flex-1">{back}</span>
          <kbd className="rounded-[6px] border border-control-line bg-panel px-[7px] py-0.5 [font-family:inherit] text-[11px] text-kbd">
            Esc
          </kbd>
        </button>
        <h1 className="m-0 mb-3.5 px-2.5 text-[22px] leading-[28px] font-bold">
          Configurações
        </h1>
        {SETTINGS_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            className="flex min-h-10 items-center gap-3 rounded-[9px] border-0 bg-transparent px-2.5 text-left text-[14px] text-muted hover:bg-control hover:text-text aria-[current=page]:bg-selected aria-[current=page]:font-medium aria-[current=page]:text-text"
            data-action="settings-section"
            data-section={section.id}
            aria-current={section.id === props.section ? 'page' : undefined}
          >
            <Icon name={section.icon} className="size-[18px] flex-none" />
            <span className="flex-1">{section.label}</span>
            {section.id === 'atualizacoes' && updateReady && (
              <span
                className="size-2 rounded-full bg-purple"
                role="img"
                aria-label="Atualização disponível"
              />
            )}
          </button>
        ))}
        <span className="mt-auto px-2.5 pt-3 text-[12px] text-faint">
          Discorja {props.config.version}
        </span>
      </nav>
      <div
        className="relative min-h-0 min-w-0 overflow-y-auto px-12 pt-10 pb-6 max-[1000px]:px-6 max-[1000px]:pt-8 short:pt-8"
        data-scroll-preserve="settings-content"
      >
        <form
          id="settings-form"
          className="settings-page max-w-[760px]"
          noValidate
        >
          <SettingsContent {...props} />
        </form>
        <div
          className="sticky bottom-0 z-5 mt-2 flex max-w-[760px] animate-rise-in items-center justify-between gap-4 rounded-[14px] border border-line bg-control py-2.5 pr-2.5 pl-[18px] shadow-[0_16px_36px_rgb(0_0_0/50%)] motion-reduce:animate-none"
          role="region"
          aria-label="Alterações não salvas"
          hidden={!props.dirty}
        >
          <span>Você tem alterações não salvas.</span>
          <div className="flex gap-2">
            <button
              type="button"
              className="button subtle"
              data-action="discard-settings"
            >
              Descartar
            </button>
            <button
              type="submit"
              className="button primary"
              form="settings-form"
              disabled={props.saving || props.photoProcessing}
            >
              {props.saving ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
