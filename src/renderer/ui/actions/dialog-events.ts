import { trapDialogTab } from '../components/accessibility';
import type { AppPage } from '../../views/design';

type AppModal =
  | 'settings'
  | 'sources'
  | 'update'
  | 'switch'
  | 'diagnostics'
  | 'profile'
  | null;

interface DialogEventState {
  modal: AppModal;
  activePage: AppPage;
  busy: boolean;
  sourcePage: 'screen' | 'window';
}

export function bindDialogKeyboardEvents(options: {
  document: Document;
  root: HTMLElement;
  getState: () => DialogEventState;
  cancelSources: () => void;
  closeSettings: () => void;
  closeModal: () => void;
  dismissUpdate: () => void;
  render: () => void;
  focusSettings: () => void;
}): void {
  const {
    document,
    root,
    getState,
    cancelSources,
    closeSettings,
    closeModal,
    dismissUpdate,
    render,
    focusSettings,
  } = options;
  document.addEventListener('keydown', (event) => {
    const state = getState();
    const { modal, activePage, busy, sourcePage } = state;
    if (
      modal === 'sources' &&
      event.target instanceof HTMLElement &&
      event.target.matches('[role="tab"]') &&
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    ) {
      event.preventDefault();
      const nextPage = sourcePage === 'screen' ? 'window' : 'screen';
      root
        .querySelector<HTMLButtonElement>(
          `[data-action="source-tab"][data-source-kind="${nextPage}"]`,
        )
        ?.click();
      return;
    }
    if (
      !modal &&
      activePage === 'settings' &&
      event.key === 'Escape' &&
      !busy
    ) {
      closeSettings();
      focusSettings();
      return;
    }
    if (!modal) {
      if (event.key === 'Escape') {
        const menu =
          document.activeElement?.closest<HTMLDetailsElement>(
            '.member-menu[open]',
          );
        if (menu) {
          event.preventDefault();
          menu.open = false;
          menu.querySelector<HTMLElement>('summary')?.focus();
        }
      }
      return;
    }
    if (event.key === 'Escape') {
      if (modal === 'sources') cancelSources();
      else if (!busy) {
        if (modal === 'update') dismissUpdate();
        closeModal();
        render();
      }
    }
    if (event.key === 'Tab') {
      const dialog = root.querySelector<HTMLElement>('[role="dialog"]');
      if (dialog) trapDialogTab(event, dialog);
    }
  });
}
