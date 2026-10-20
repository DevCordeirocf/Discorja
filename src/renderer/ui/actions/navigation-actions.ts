import type { AppPage } from '../../views/design';

type Modal =
  'settings' | 'sources' | 'update' | 'switch' | 'diagnostics' | null;

export function handleNavigationAction(options: {
  action?: string;
  busy: boolean;
  hasRoom: boolean;
  activePage: AppPage;
  previousPage: AppPage;
  configUrl: string;
  setActivePage: (page: AppPage) => void;
  setPreviousPage: (page: AppPage) => void;
  setModal: (modal: Modal) => void;
  clearSwitchTarget: () => void;
  setReturnFocusAction: (action: string) => void;
  setEditingName: (editing: boolean) => void;
  setNotice: (notice: null) => void;
  setSettingUrl: (url: string) => void;
  clearConnectionCheck: () => void;
  dismissUpdate: () => void;
  confirmSwitch: () => void;
  focusDisplayName: () => void;
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
      setActivePage('home');
      options.setEditingName(true);
      setModal(null);
      render();
      options.focusDisplayName();
      return true;
    case 'home':
      setActivePage('home');
      setModal(null);
      render();
      return true;
    case 'settings':
      if (!busy) {
        if (activePage !== 'settings') options.setPreviousPage(activePage);
        setActivePage('settings');
        setModal(null);
        options.setReturnFocusAction('settings');
        options.setNotice(null);
        options.setSettingUrl(options.configUrl);
        options.clearConnectionCheck();
        render();
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
