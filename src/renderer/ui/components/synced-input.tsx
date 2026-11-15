import { useLayoutEffect, useRef, type InputHTMLAttributes } from 'react';

/**
 * An uncontrolled input that follows the app state. Typing reaches the state
 * through the delegated listeners on `#app` and does not re-render, so the
 * field keeps its caret; any later render puts the state value back, which is
 * how "Descartar" or a cleared draft reach the screen.
 */
export function SyncedInput({
  value,
  checked,
  ...props
}: Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'checked' | 'defaultValue' | 'defaultChecked'
> & {
  value?: string;
  checked?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const input = ref.current!;
    if (value !== undefined && input.value !== value) input.value = value;
    if (checked !== undefined && input.checked !== checked)
      input.checked = checked;
  });
  return (
    <input ref={ref} defaultValue={value} defaultChecked={checked} {...props} />
  );
}
