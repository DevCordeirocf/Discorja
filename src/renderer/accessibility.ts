type ControlKey = {
  id?: string;
  action?: string;
  peer?: string;
  publication?: string;
  source?: string;
  details?: string;
  label?: string;
};
export interface InteractionState {
  control: ControlKey | null;
  inDialog: boolean;
  selection: [number | null, number | null] | null;
  openDetails: { id: string; peer: string }[];
}

function key(element: HTMLElement): ControlKey | null {
  if (element.id) return { id: element.id };
  if (element.tagName === 'SUMMARY') {
    const details = element.parentElement;
    if (details?.id) return { details: details.id };
    if (details?.dataset.peer)
      return { details: '', peer: details.dataset.peer };
  }
  if (element.dataset.action)
    return {
      action: element.dataset.action,
      peer: element.dataset.peer,
      publication: element.dataset.publication,
      source: element.dataset.source,
      ...(['close-modal', 'cancel-sources'].includes(element.dataset.action)
        ? {
            label:
              element.getAttribute('aria-label') ?? element.textContent?.trim(),
          }
        : {}),
    };
  return null;
}

export function rememberInteraction(root: HTMLElement): InteractionState {
  const active =
    document.activeElement instanceof HTMLElement &&
    root.contains(document.activeElement)
      ? document.activeElement
      : null;
  return {
    control: active ? key(active) : null,
    inDialog: Boolean(active?.closest('[role="dialog"]')),
    selection:
      active instanceof HTMLInputElement &&
      ['text', 'search', 'url', 'tel', 'password'].includes(active.type)
        ? [active.selectionStart, active.selectionEnd]
        : null,
    openDetails: [
      ...root.querySelectorAll<HTMLDetailsElement>('details[open]'),
    ].map((details) => ({ id: details.id, peer: details.dataset.peer ?? '' })),
  };
}

export function focusable(container: HTMLElement): HTMLElement[] {
  return [
    ...container.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, a[href], summary, [tabindex]',
    ),
  ].filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(':disabled') &&
      !element.closest('[inert]') &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== 'hidden',
  );
}

export function restoreInteraction(
  root: HTMLElement,
  state: InteractionState,
  dialogOpen: boolean,
): void {
  for (const details of root.querySelectorAll<HTMLDetailsElement>('details')) {
    if (
      state.openDetails.some((saved) =>
        saved.id
          ? saved.id === details.id
          : saved.peer && saved.peer === details.dataset.peer,
      )
    )
      details.open = true;
  }
  if (
    !state.control ||
    (dialogOpen && !state.inDialog) ||
    (!dialogOpen && state.inDialog)
  )
    return;
  const saved = state.control;
  const target = [
    ...root.querySelectorAll<HTMLElement>('[id], [data-action], summary'),
  ].find((element) => {
    const candidate = key(element);
    return (
      candidate &&
      Object.keys(saved).every(
        (name) =>
          candidate[name as keyof ControlKey] ===
          saved[name as keyof ControlKey],
      )
    );
  });
  if (
    target &&
    !target.matches(':disabled') &&
    !target.closest('[inert]') &&
    target.getClientRects().length
  ) {
    target.focus({ preventScroll: true });
    if (
      state.selection &&
      target instanceof HTMLInputElement &&
      state.selection[0] !== null &&
      state.selection[1] !== null
    )
      target.setSelectionRange(...(state.selection as [number, number]));
  } else if (!dialogOpen) {
    const fallback = root.querySelector<HTMLElement>(
      '#screens-heading, main h1, main',
    );
    if (fallback) {
      fallback.tabIndex = -1;
      fallback.focus({ preventScroll: true });
    }
  }
}

export function trapDialogTab(event: KeyboardEvent, dialog: HTMLElement): void {
  if (event.key !== 'Tab') return;
  const elements = focusable(dialog),
    first = elements[0],
    last = elements.at(-1);
  if (!first) {
    event.preventDefault();
    dialog.tabIndex = -1;
    dialog.focus();
    return;
  }
  if (
    !dialog.contains(document.activeElement) ||
    (event.shiftKey && document.activeElement === first)
  ) {
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
