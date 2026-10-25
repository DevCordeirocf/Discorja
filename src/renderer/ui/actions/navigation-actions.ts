import type { AppPage } from '../../views/design';
import type { AppModal } from '../../views/modals';
import {
  isSettingsSection,
  type SettingsSection,
} from '../../views/settings-view';

export function handleNavigationAction(options: {
  action?: string;
  /** data-section of the clicked button, for the settings navigation. */
  section?: string;
  busy: boolean;
  hasRoom: boolean;
  activePage: AppPage;
  previousPage: AppPage;
  configUrl: string;
  setActivePage: (page: AppPage) => void;
  setPreviousPage: (page: AppPage) => void;
  setModal: (modal: AppModal) => void;
  setSettingsSection: (section: SettingsSection) => void;
  clearSwitchTarget: () => void;
  setReturnFocusAction: (action: string) => void;
  setEditingName: (editing: boolean) => void;
  setNotice: (notice: null) => void;
  setSettingUrl: (url: string) => void;
  clearConnectionCheck: () => void;
  dismissUpdate: () => void;
  confirmSwitch: () => void;
  focusDisplayName: () => void;
  focusSettingsSection: (section: SettingsSection) => void;
  render: () => void;
  focusSettings: () => void;
}): boolean {
  const {
    action,
    busy,
    hasRoom,
    activePage,
    previousPage,
    setActivePage,
    setModal,
    render,
  } = options;
  const openSettings = (section: SettingsSection): void => {
    if (activePage !== 'settings') {
      options.setPreviousPage(activePage);
      options.setSettingUrl(options.configUrl);
      options.clearConnectionCheck();
    }
    options.setSettingsSection(section);
    setActivePage('settings');
    setModal(null);
    options.setNotice(null);
    render();
  };
  switch (action) {
    case 'room':
      setActivePage(hasRoom ? 'room' : 'home');
      setModal(null);
      render();
      return true;
    case 'show-diagnostics':
      options.setReturnFocusAction('show-diagnostics');
      setModal('diagnostics');
      render();
      return true;
    case 'cancel-switch':
      options.clearSwitchTarget();
      setModal(null);
      setActivePage(hasRoom ? 'room' : 'home');
      render();
      return true;
    case 'confirm-switch':
      options.confirmSwitch();
      return true;
    case 'defer-update':
      options.dismissUpdate();
      setModal(null);
      render();
      return true;
    case 'edit-name':
      if (!busy) {
        options.setReturnFocusAction('edit-name');
        openSettings('perfil');
        options.focusDisplayName();
      }
      return true;
    case 'home':
      setActivePage('home');
      setModal(null);
      render();
      return true;
    case 'settings':
      if (!busy) {
        options.setReturnFocusAction('settings');
        openSettings('transmissao');
      }
      return true;
    case 'settings-section':
      if (isSettingsSection(options.section)) {
        options.setSettingsSection(options.section);
        render();
        options.focusSettingsSection(options.section);
      }
      return true;
    case 'close-settings':
      if (!busy) {
        setActivePage(
          previousPage === 'room' && !hasRoom ? 'home' : previousPage,
        );
        render();
        options.focusSettings();
      }
      return true;
    case 'close-modal':
      if (!busy) {
        setModal(null);
        render();
      }
      return true;
    case 'dismiss':
      options.setNotice(null);
      render();
      return true;
    case 'install-update':
      setModal('update');
      render();
      return true;
    default:
      return false;
  }
}
