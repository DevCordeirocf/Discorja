import {
  useLayoutEffect,
  useRef,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { SyncedInput } from '../ui/components/synced-input';

/** One page of Configurações: heading, groups and an optional badge. */
export function SettingsSection(props: {
  id: string;
  title: string;
  description: string;
  /** Extra hook class (`transmission-settings` is used by smoke tests). */
  className?: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className={`flex flex-col gap-2.5 ${props.className ?? ''}`}
      aria-labelledby={props.id}
    >
      <header className="mb-[18px] flex items-end justify-between gap-4 short:mb-2.5">
        <div>
          <h2
            id={props.id}
            className="mx-0 mt-0 mb-1.5 text-[24px] leading-[30px] font-bold"
          >
            {props.title}
          </h2>
          <p className="m-0 text-[14px] leading-5 text-muted">
            {props.description}
          </p>
        </div>
        {props.badge}
      </header>
      {props.children}
    </section>
  );
}

export function GroupTitle(props: { children: ReactNode }) {
  return (
    <h3 className="mx-0 mt-2 mb-0 text-[11px] leading-4 font-bold tracking-[0.08em] text-[#a9a8bb] uppercase">
      {props.children}
    </h3>
  );
}

export const GROUP =
  'mb-[18px] rounded-[14px] border border-[#262731] bg-[#15161b] short:mb-3';
/** A group whose content is laid out freely instead of in rows. */
export const PADDED_GROUP = `${GROUP} flex flex-col gap-[14px] p-5`;

export function SettingsGroup(props: {
  className?: string;
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className={props.className ?? GROUP} aria-label={props.label}>
      {props.children}
    </div>
  );
}

export const ROW_TITLE = 'text-[14px] font-medium text-text';
export const ROW_NOTE = 'text-[12px] leading-[17px] text-kbd';

/** Title and note on the left, control on the right; rows are separated. */
export function SettingsRow(props: { copy: ReactNode; control: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4 short:py-[11px] max-[1000px]:flex-wrap max-[1000px]:gap-x-6 max-[1000px]:gap-y-3 [&+&]:border-t [&+&]:border-[#262731]">
      <div className="flex min-w-0 flex-col gap-[3px]">{props.copy}</div>
      <div className="flex flex-none items-center justify-end">
        {props.control}
      </div>
    </div>
  );
}

/** Small rounded label beside a section heading. */
export function SettingsPill(props: { children: ReactNode }) {
  return (
    <span className="inline-flex flex-none items-center gap-1.5 rounded-full border border-line px-2.5 py-[5px] text-[12px] text-muted [&_.spinner]:size-3">
      {props.children}
    </span>
  );
}

/** Mutually exclusive choices; each option is a real radio input. */
export function Segmented(props: {
  id: string;
  labelId: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled: boolean;
}) {
  return (
    <div
      id={props.id}
      className="relative flex rounded-[10px] border border-[#262731] bg-[#0f1014] p-[3px]"
      role="radiogroup"
      aria-labelledby={props.labelId}
    >
      {props.options.map((option) => (
        <label
          key={option.value}
          className="relative grid h-8 min-w-11 cursor-pointer place-items-center rounded-[7px] px-[14px] text-[13px] whitespace-nowrap text-kbd transition-colors duration-[140ms] ease-[ease] hover:text-text has-checked:bg-selected has-checked:font-medium has-checked:text-text has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-purple has-focus-visible:outline-solid has-disabled:cursor-not-allowed has-disabled:opacity-60 motion-reduce:transition-none"
        >
          {/* The radio covers its label invisibly, so clicks and keys reach it. */}
          <SyncedInput
            className="absolute inset-0 m-0 size-full cursor-[inherit] opacity-0"
            type="radio"
            id={`${props.id}-${option.value}`}
            name={props.id}
            value={option.value}
            checked={option.value === props.value}
            disabled={props.disabled}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

/** A native checkbox drawn as a switch; `role="switch"` keeps its meaning. */
export function Switch(props: {
  id: string;
  checked: boolean;
  disabled: boolean;
}) {
  return (
    <SyncedInput
      id={props.id}
      className="relative m-0 h-[26px] w-11 cursor-pointer appearance-none rounded-full bg-line transition-colors duration-160 ease-[ease] after:absolute after:top-[3px] after:left-[3px] after:size-5 after:rounded-[50%] after:bg-muted after:transition-[transform,background-color] after:duration-160 after:ease-[ease] after:content-[''] checked:bg-purple checked:after:bg-[#1b1530] checked:after:[transform:translateX(18px)] focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none motion-reduce:after:transition-none"
      type="checkbox"
      role="switch"
      checked={props.checked}
      disabled={props.disabled}
    />
  );
}

/** A number field with its unit, as one control. */
export function UnitInput(props: {
  id: string;
  min: number;
  max: number;
  value: number;
  describedBy: string;
  disabled: boolean;
  numeric?: boolean;
}) {
  return (
    <div className="flex h-[38px] w-[200px] items-center overflow-hidden rounded-[10px] border border-[#46384f] bg-[#0f1014] focus-within:border-[#b99be6]">
      <SyncedInput
        id={props.id}
        className="w-full min-w-0 border-0 bg-transparent px-2.5 py-2 text-[11px] focus-visible:outline-none"
        type="number"
        min={props.min}
        max={props.max}
        step="1"
        inputMode={props.numeric ? 'numeric' : undefined}
        value={String(props.value)}
        aria-describedby={props.describedBy}
        disabled={props.disabled}
      />
      <span className="pr-3 text-[9px] text-[#a08ab1]">Mbps</span>
    </div>
  );
}

/** An uncontrolled select that follows the app state, like `SyncedInput`. */
export function SyncedSelect({
  value,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'defaultValue'> & {
  value: string;
}) {
  const ref = useRef<HTMLSelectElement>(null);
  useLayoutEffect(() => {
    if (ref.current!.value !== value) ref.current!.value = value;
  });
  return <select ref={ref} defaultValue={value} {...props} />;
}

export const SELECT =
  'h-[38px] w-[200px] rounded-[10px] border border-line bg-[#0f1014] px-2.5 [font:inherit] text-[14px] text-text disabled:opacity-60';

/** Warning inside a group, such as "Saia da sala para alterar o servidor." */
export const GROUP_WARNING =
  'm-0 rounded-[5px] bg-[#352635] p-2.5 text-[13px] leading-[1.7] text-[#cfa9c3]';
