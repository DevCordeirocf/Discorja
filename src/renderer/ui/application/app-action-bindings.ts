import { bindActionRouter } from '../actions/action-router';
import type { ActionRouterState } from '../actions/action-router';
import type { AppPage } from '../../views/design';
import type { AppModal } from '../../views/modals';
import type { ClientMessage } from '../../../shared/protocol';

type RouterCallbacks = Parameters<typeof bindActionRouter>[2];

export type AppActionStateUpdate = Partial<{
  sourcePage: 'screen' | 'window';
  selectedSource: string;
  activePage: AppPage;
  previousPage: AppPage;
  modal: AppModal;
  switchTarget: { kind: 'create' | 'join'; code?: string } | null;
  returnFocusAction: string;
  editingName: boolean;
  notice: { text: string; kind: 'error' | 'info' | 'success' } | null;
  settingUrl: string;
  connectionCheck: string;
  updateDismissed: boolean;
  joinCode: string;
  receiveMuted: boolean;
  receiveVolume: number;
}>;

export interface AppActionBindingContext {
  root: HTMLElement;
  getState(): ActionRouterState;
  send(message: ClientMessage): boolean;
  selectPublication: RouterCallbacks['selectPublication'];
  cancelSources(): void;
  openSources(): void;
  startSharing(): void;
  stopSharing(): void;
  notify: RouterCallbacks['notify'];
  leaveRoom(): void;
  connectRoom(kind: 'create' | 'join'): void;
  confirmRoomSwitch(): void;
  requestCreate(): void;
  toggleSidebar(): void;
  testConnection(): void;
  render(): void;
  updateState(patch: AppActionStateUpdate): void;
}

export function bindAppActionRouter(context: AppActionBindingContext): void {
  bindActionRouter(context.root, context.getState, {
    send: context.send,
    selectPublication: context.selectPublication,
    stopPublication: (peerId) =>
      context.send({ type: 'stop-publication', peerId }),
    setSourcePage: (value) => context.updateState({ sourcePage: value }),
    setSelectedSource: (value) =>
      context.updateState({ selectedSource: value }),
    openSources: () => {
      void context.openSources();
    },
    cancelSources: context.cancelSources,
    startSharing: () => {
      void context.startSharing();
    },
    stopSharing: context.stopSharing,
    notify: context.notify,
    setActivePage: (value) => context.updateState({ activePage: value }),
    setPreviousPage: (value) => context.updateState({ previousPage: value }),
    setModal: (value) => context.updateState({ modal: value }),
    clearSwitchTarget: () => context.updateState({ switchTarget: null }),
    setReturnFocusAction: (value) =>
      context.updateState({ returnFocusAction: value }),
    setEditingName: (value) => context.updateState({ editingName: value }),
    setNotice: (value) => context.updateState({ notice: value }),
    setSettingUrl: (value) => context.updateState({ settingUrl: value }),
    clearConnectionCheck: () => context.updateState({ connectionCheck: '' }),
    dismissUpdate: () => context.updateState({ updateDismissed: true }),
    confirmSwitch: context.confirmRoomSwitch,
    toggleSidebar: context.toggleSidebar,
    testConnection: context.testConnection,
    leaveRoom: context.leaveRoom,
    connectRoom: (kind) => {
      void context.connectRoom(kind);
    },
    setJoinCode: (value) => context.updateState({ joinCode: value }),
    confirmCreate: context.requestCreate,
    render: context.render,
    setReceiveMuted: (value) => context.updateState({ receiveMuted: value }),
    setReceiveVolume: (value) => context.updateState({ receiveVolume: value }),
  });
}
