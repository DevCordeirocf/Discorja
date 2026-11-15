import type { ReactNode } from 'react';
import type { CaptureSource, UpdateState } from '../../shared/protocol';
import type { ChangelogEntry } from '../features/whats-new/changelog';
import { Icon } from '../ui/components/icon';
import { SyncedInput } from '../ui/components/synced-input';
import {
  MODAL_BODY,
  Modal,
  ModalDescription,
  ModalFooter,
  ModalHeading,
  ModalPlainTitle,
  ModalTitle,
} from './modal';
import { WhatsNewModal } from './whats-new';

export type AppModal =
  | 'settings'
  | 'sources'
  | 'update'
  | 'switch'
  | 'diagnostics'
  | 'add-group'
  | 'whats-new'
  | 'leave-group'
  | 'bug-report'
  | null;

type Busy = 'room' | 'sources' | 'capture' | 'settings' | null;

/** Computer audio choices shown under the source list. */
export interface CaptureAudioView {
  include: boolean;
  exclude: boolean;
  supported: boolean;
}

export interface ModalViewProps {
  modal: AppModal;
  isRoomOwner: boolean;
  update: UpdateState;
  version: string;
  hasRoom: boolean;
  /** The diagnostics panel; `patchMetrics` fills in the measured values. */
  diagnostics: ReactNode;
  sources: CaptureSource[];
  selectedSource: string;
  busy: Busy;
  sourcePage: 'screen' | 'window';
  captureAudio: CaptureAudioView;
  whatsNew: ChangelogEntry[];
  /** Extra dialogs owned by features (for example groups). */
  renderFeatureModal?: (modal: AppModal) => ReactNode;
}

const SETTINGS_MODAL = `w-[510px] ${MODAL_BODY}`;

function SwitchModal({ isRoomOwner }: { isRoomOwner: boolean }) {
  return (
    <Modal labelledBy="modal-title" className={SETTINGS_MODAL}>
      <ModalPlainTitle id="modal-title">Trocar de sala?</ModalPlainTitle>
      <ModalDescription>
        A transmissão e a reprodução atuais serão encerradas antes de conectar à
        próxima sala.
        {isRoomOwner &&
          ' Como você é o dono, a sala atual será encerrada para todos.'}{' '}
        A próxima conexão pode falhar; nenhuma captura será reiniciada
        automaticamente.
      </ModalDescription>
      <ModalFooter>
        <button className="button subtle" data-action="cancel-switch">
          Continuar nesta sala
        </button>
        <button className="button primary" data-action="confirm-switch">
          Trocar de sala
        </button>
      </ModalFooter>
    </Modal>
  );
}

function updateStatus(update: UpdateState): string {
  if (update.status === 'downloading')
    return `Baixando… ${Math.round(update.percent ?? 0)}%`;
  if (update.status === 'error')
    return (
      update.message ?? 'Falha ao atualizar. Tente novamente nas configurações.'
    );
  if (update.status === 'downloaded')
    return 'O aplicativo será reiniciado para instalar.';
  return '';
}

function UpdateModal(props: ModalViewProps) {
  const { update } = props;
  const downloaded = update.status === 'downloaded';
  return (
    <Modal labelledBy="modal-title" className={SETTINGS_MODAL}>
      <ModalHeading className="mb-[31px] items-start">
        <ModalTitle id="modal-title">
          {downloaded ? 'Atualização pronta' : 'Atualização disponível'}
        </ModalTitle>
      </ModalHeading>
      <ModalDescription>
        Versão instalada: {props.version}. Nova versão:{' '}
        {update.version ?? 'disponível'}.
      </ModalDescription>
      <p role="status">{updateStatus(update)}</p>
      {props.hasRoom && downloaded && (
        <p className="rounded-[5px] bg-[#352635] p-2.5 text-[10px] leading-[1.7] text-[#cfa9c3]">
          Reiniciar encerrará sua participação e qualquer transmissão ativa.
        </p>
      )}
      <ModalFooter>
        <button className="button subtle" data-action="defer-update">
          Depois
        </button>
        {downloaded ? (
          <button
            className="button primary"
            data-action="confirm-install-update"
          >
            Reiniciar e atualizar
          </button>
        ) : update.status === 'available' ? (
          <button className="button primary" data-action="download-update">
            Atualizar agora
          </button>
        ) : null}
      </ModalFooter>
    </Modal>
  );
}

function DiagnosticsModal({ diagnostics }: { diagnostics: ReactNode }) {
  return (
    <Modal
      labelledBy="modal-title"
      overlayClassName="diagnostics-overlay"
      className="flex max-h-[calc(100dvh-48px)] w-[min(900px,100%)] animate-[diagnostics-enter_160ms_cubic-bezier(0.2,0.8,0.2,1)_both] flex-col overflow-hidden p-6"
    >
      <ModalHeading
        className="mb-[18px] flex-none items-center"
        close={{ action: 'close-modal', label: 'Fechar diagnóstico' }}
      >
        <h2
          id="modal-title"
          className="m-0 text-[23px] font-medium tracking-normal"
        >
          Diagnóstico da conexão
        </h2>
      </ModalHeading>
      <div className="min-h-0 overflow-y-auto [scrollbar-width:thin]">
        {diagnostics}
      </div>
    </Modal>
  );
}

function SourceOption(props: {
  source: CaptureSource;
  index: number;
  selected: boolean;
  disabled: boolean;
}) {
  const { source } = props;
  const kindIcon = source.kind === 'screen' ? 'screen' : 'window';
  // `source-option` stays as a hook for the smoke tests.
  return (
    <button
      id={`source-${props.index}`}
      className={`source-option min-w-0 overflow-hidden rounded-[9px] border bg-[#231e2d] p-0 text-left hover:enabled:border-[#79608e] ${props.selected ? 'selected border-[#ba96ed] shadow-[0_0_0_1px_#ba96ed]' : 'border-[#3c3049]'}`}
      data-action="select-source"
      data-source={source.id}
      aria-pressed={props.selected}
      disabled={props.disabled}
    >
      <div className="relative grid aspect-video place-items-center border-b border-[#3a2f45] bg-[#121016]">
        {source.thumbnail ? (
          <img
            className="absolute inset-0 size-full object-contain"
            src={source.thumbnail}
            alt={`Prévia de ${source.name}`}
          />
        ) : (
          <Icon name={kindIcon} className="size-[34px] text-[#685774]" />
        )}
        <span
          className={`absolute right-[9px] bottom-[9px] size-[22px] place-items-center rounded-full border border-[#d2b6fa] bg-[#ae8ce1] text-[#271836] ${props.selected ? 'grid' : 'hidden'}`}
        >
          <Icon name="check" className="size-[13px]" />
        </span>
      </div>
      <span className="flex items-center gap-2 p-3 text-[10px] text-[#c4b1d3]">
        <Icon name={kindIcon} className="size-[14px] text-[#897397]" />
        <span className="truncate">{source.name}</span>
      </span>
    </button>
  );
}

function CaptureAudioOptions(props: { audio: CaptureAudioView; busy: Busy }) {
  const { audio } = props;
  return (
    <div className="mt-3 grid gap-2 rounded-[10px] border border-[#34313f] bg-[#17151f] px-[14px] py-3 text-[12px] [&_label]:flex [&_label]:items-center [&_label]:gap-[9px] [&_label]:leading-[1.6]">
      <label>
        <SyncedInput
          id="include-system-audio"
          className="accent-[#b8a0ff]"
          type="checkbox"
          checked={audio.include}
          disabled={!audio.supported || !!props.busy}
        />{' '}
        Áudio do computador
      </label>
      {!audio.supported && <small>Disponível no Windows.</small>}
      {audio.include && (
        <>
          <label>
            <SyncedInput
              id="exclude-discord-audio"
              className="accent-[#b8a0ff]"
              type="checkbox"
              checked={audio.exclude}
              disabled={!!props.busy}
            />{' '}
            Excluir o Discord
          </label>
          {audio.exclude ? (
            <small>Você continuará ouvindo a call.</small>
          ) : (
            <p className="m-0 rounded-[5px] bg-[#352635] p-2.5 text-[10px] leading-[1.6] text-[#b7b0c5]">
              O áudio inclui o Discord e outros aplicativos.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function SourcesModal(props: ModalViewProps) {
  const { busy, sourcePage, selectedSource } = props;
  const indexed = props.sources.map((source, index) => ({ source, index }));
  const visible = indexed.filter(({ source }) =>
    sourcePage === 'screen'
      ? source.kind === 'screen'
      : source.kind === 'window',
  );
  const tabId =
    sourcePage === 'screen' ? 'source-tab-screen' : 'source-tab-guides';
  const tab = (id: string, kind: 'screen' | 'window', label: string) => (
    <button
      id={id}
      className="min-w-[92px] cursor-pointer border-0 border-b-2 border-transparent bg-transparent px-[14px] py-2.5 text-[13px] text-[#9e91ad] hover:enabled:text-[#e9def8] focus-visible:[outline-offset:-3px] disabled:cursor-not-allowed disabled:opacity-50 aria-selected:border-b-[#b894e8] aria-selected:text-[#e6d5ff]"
      role="tab"
      aria-selected={sourcePage === kind}
      aria-controls="source-panel"
      tabIndex={sourcePage === kind ? 0 : -1}
      data-action="source-tab"
      data-source-kind={kind}
      disabled={!!busy}
    >
      {label}
    </button>
  );
  return (
    <Modal
      labelledBy="modal-title"
      overlayScrollKey="source-overlay"
      scrollKey="source-modal"
      className="max-h-[90vh] w-[670px] overflow-y-auto overscroll-contain px-[29px] pt-[27px]"
    >
      <ModalHeading
        className="items-start"
        close={{ action: 'cancel-sources', label: 'Fechar' }}
      >
        <ModalTitle id="modal-title">Compartilhar</ModalTitle>
      </ModalHeading>
      <div
        className="mt-1 mb-[14px] flex gap-2 border-b border-[#393040]"
        role="tablist"
        aria-label="Tipo de compartilhamento"
      >
        {tab('source-tab-screen', 'screen', 'Tela')}
        {tab('source-tab-guides', 'window', 'Guias')}
      </div>
      {busy === 'sources' ? (
        <div className="flex min-h-[180px] items-center justify-center gap-2.5 p-5 text-[11px] leading-[1.8] text-[#a58cb9]">
          <span className="spinner" /> Carregando…
        </div>
      ) : (
        // `source-groups` stays as a hook for the smoke tests.
        <div
          id="source-panel"
          className="source-groups block max-h-[min(410px,48vh)] min-h-[120px] overflow-y-auto overscroll-contain pt-0.5 pr-[5px] pb-2 pl-0 [scrollbar-gutter:stable]"
          data-scroll-preserve="source-groups"
          role="tabpanel"
          aria-labelledby={tabId}
        >
          {visible.length ? (
            <div className="-mx-1 grid grid-cols-2 gap-4 px-1 pt-[3px] pb-2">
              {visible.map(({ source, index }) => (
                <SourceOption
                  key={source.id}
                  source={source}
                  index={index}
                  selected={selectedSource === source.id}
                  disabled={busy === 'capture'}
                />
              ))}
            </div>
          ) : (
            <div className="grid min-h-[120px] place-items-center text-[12px] text-[#9e91ad]">
              Nenhuma {sourcePage === 'screen' ? 'tela' : 'guia'} disponível.
            </div>
          )}
        </div>
      )}
      <CaptureAudioOptions audio={props.captureAudio} busy={busy} />
      <ModalFooter className="mt-[14px] py-[14px]">
        <button
          className="button subtle"
          data-action="refresh-sources"
          disabled={!!busy}
        >
          Atualizar
        </button>
        <button
          className="button primary"
          data-action="start-share"
          disabled={!selectedSource || !!busy}
        >
          {busy === 'capture' ? (
            <>
              <span className="spinner" /> Iniciando…
            </>
          ) : (
            'Iniciar'
          )}
        </button>
      </ModalFooter>
    </Modal>
  );
}

export function ModalView(props: ModalViewProps) {
  const { modal } = props;
  if (!modal) return null;
  if (modal === 'whats-new')
    return <WhatsNewModal version={props.version} entries={props.whatsNew} />;
  const featureModal = props.renderFeatureModal?.(modal);
  if (featureModal) return featureModal;
  if (modal === 'switch')
    return <SwitchModal isRoomOwner={props.isRoomOwner} />;
  if (modal === 'update') return <UpdateModal {...props} />;
  if (modal === 'diagnostics')
    return <DiagnosticsModal diagnostics={props.diagnostics} />;
  if (modal === 'sources') return <SourcesModal {...props} />;
  return null;
}
