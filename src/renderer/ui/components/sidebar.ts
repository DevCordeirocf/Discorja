export function toggleSidebar(options: {
  root: HTMLElement;
  isCollapsed: () => boolean;
  setCollapsed: (collapsed: boolean) => void;
  saveCollapsed: (collapsed: boolean) => void;
}): void {
  const collapsed = !options.isCollapsed();
  options.setCollapsed(collapsed);
  options.saveCollapsed(collapsed);
  options.root
    .querySelector('.app-shell')
    ?.classList.toggle('is-collapsed', collapsed);
  const brand = options.root.querySelector<HTMLButtonElement>('.brand-logo');
  if (brand) {
    brand.dataset.action = collapsed ? 'toggle-sidebar' : 'home';
    brand.setAttribute(
      'aria-label',
      collapsed ? 'Expandir menu' : 'Discorja · Início',
    );
    brand.title = collapsed ? 'Expandir menu' : 'Início';
    if (collapsed) {
      brand.setAttribute('aria-expanded', 'false');
      brand.setAttribute('aria-controls', 'main-navigation');
    } else {
      brand.removeAttribute('aria-expanded');
      brand.removeAttribute('aria-controls');
    }
  }
  options.root
    .querySelector<HTMLButtonElement>(
      collapsed ? '.brand-logo' : '.sidebar-toggle',
    )
    ?.focus();
}
