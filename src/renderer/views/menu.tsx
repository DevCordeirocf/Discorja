import type { ReactNode } from 'react';
import { Icon } from '../ui/components/icon';

/** Floating menu anchored to a `relative` parent; position comes from the caller. */
export function PopoverMenu(props: {
  label: string;
  /** Position and width, plus any hook class. */
  className: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`absolute z-30 flex flex-col gap-0.5 rounded-[14px] border border-line bg-surface p-2 shadow-[0_12px_32px_rgb(0_0_0/45%)] ${props.className}`}
      role="menu"
      aria-label={props.label}
    >
      {props.children}
    </div>
  );
}

export function MenuItem(props: {
  action: string;
  icon?: string;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`flex min-h-10 cursor-pointer items-center gap-2.5 rounded-[8px] border-0 px-2.5 py-0 text-left text-[14px] ${props.danger ? 'bg-transparent font-medium text-[#ff9a9a] hover:bg-[#34212a] hover:text-[#efacbf]' : 'bg-transparent text-text hover:bg-raised'}`}
      role="menuitem"
      data-action={props.action}
    >
      {props.icon && (
        <Icon name={props.icon} className="size-[18px] text-muted" />
      )}
      {props.children}
    </button>
  );
}
