import type { MultiRoomState, RoomState } from '../../../shared/protocol';
import type { PeerMetrics, StreamPreferences } from '../../../shared/quality';

/** Recent measurements and session flags; the main process sanitizes them. */
export function diagnosticsInput(
  state: {
    preferences: StreamPreferences;
    latestMetrics: PeerMetrics[];
    incomingMetrics: PeerMetrics[];
    signalRecovering: boolean;
    room: unknown;
    busy: string | null;
    sharing: boolean;
    watching: unknown;
    multi: MultiRoomState | null;
    roomState: RoomState | null;
  },
  now = Date.now(),
) {
  return {
    preferences: state.preferences,
    metrics: [...state.latestMetrics, ...state.incomingMetrics]
      .filter((metric) => now - metric.timestamp <= 8000)
      .map((metric) => ({
        ...metric,
        ageMs: Math.max(0, now - metric.timestamp),
      })),
    session: {
      signaling: state.signalRecovering
        ? 'recovering'
        : state.room
          ? 'connected'
          : state.busy === 'room'
            ? 'connecting'
            : 'idle',
      publishing: state.sharing,
      watching: Boolean(state.watching),
      publications: state.multi?.publications.length ?? (state.sharing ? 1 : 0),
      participants:
        state.roomState && state.roomState.protocol >= 3
          ? state.roomState.participants.length
          : state.roomState?.protocol === 2
            ? state.roomState.participants.length
            : 0,
    },
  };
}
