import type { ApplicationRenderState } from './render-application';

/** Choose a dialog that opens by itself, without replacing one already open. */
export function pickAutoModal(
  state: Pick<
    ApplicationRenderState,
    | 'loaded'
    | 'modal'
    | 'busy'
    | 'update'
    | 'updateDismissed'
    | 'updatePrompted'
    | 'whatsNewPending'
    | 'page'
    | 'hasRoom'
  >,
): 'update' | 'whats-new' | null {
  if (!state.loaded || state.modal || state.busy) return null;
  if (
    !state.updateDismissed &&
    !state.updatePrompted &&
    ['available', 'downloaded'].includes(state.update.status)
  )
    return 'update';
  // The notes wait for a calm moment: on the home page, outside any room.
  if (state.whatsNewPending && state.page === 'home' && !state.hasRoom)
    return 'whats-new';
  return null;
}
