export type RoomSwitchTarget = { kind: 'create' | 'join'; code?: string };

export function createRoomSwitchActions(options: {
  isBusy: () => boolean;
  isApplyingPreferences: () => boolean;
  isRecovering: () => boolean;
  getDisplayName: () => string;
  getCurrentRoomCode: () => string | undefined;
  getSwitchTarget: () => RoomSwitchTarget | null;
  setSwitchTarget: (target: RoomSwitchTarget | null) => void;
  setJoinCode: (code: string) => void;
  setModal: (modal: 'switch' | null) => void;
  setActivePage: (page: 'home' | 'room') => void;
  render: () => void;
  notify: (message: string) => void;
  leaveRoom: () => void;
  connectRoom: (kind: 'create' | 'join') => Promise<void>;
}) {
  const confirmRoomSwitch = async (): Promise<void> => {
    const target = options.getSwitchTarget();
    if (!target) return;
    options.setSwitchTarget(null);
    // Release tracks, sockets and peers synchronously before any new connection.
    options.leaveRoom();
    if (target.code) options.setJoinCode(target.code);
    await options.connectRoom(target.kind);
  };

  const requestRoomSwitch = (target: RoomSwitchTarget): void => {
    if (
      options.isBusy() ||
      options.isApplyingPreferences() ||
      options.isRecovering()
    )
      return;
    if (!options.getDisplayName().trim()) {
      options.setModal(null);
      options.notify('Informe seu nome antes de entrar em uma sala.');
      return;
    }
    if (
      target.kind === 'join' &&
      target.code === options.getCurrentRoomCode()
    ) {
      options.setModal(null);
      options.setActivePage('room');
      options.render();
      return;
    }
    options.setSwitchTarget(target);
    if (options.getCurrentRoomCode()) {
      options.setModal('switch');
      options.render();
    } else void confirmRoomSwitch();
  };

  return { requestRoomSwitch, confirmRoomSwitch };
}
