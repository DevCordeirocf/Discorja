/**
 * Routes clicks on feature buttons that the main action router does not know,
 * keeping new features out of the shared router's large option bag.
 */
export function bindExtraActions(
  root: HTMLElement,
  handlers: Record<string, (button: HTMLButtonElement) => void>,
): void {
  root.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      'button[data-action]',
    );
    if (!button || button.disabled || !root.contains(button)) return;
    const handler = handlers[button.dataset.action ?? ''];
    if (!handler) return;
    event.preventDefault();
    handler(button);
  });
}
