import { iconPaths } from './icons';

/** React counterpart of `icon()`, drawing the same static SVG paths. */
export function Icon({
  name,
  className = '',
}: {
  name: string;
  className?: string;
}) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: iconPaths(name) }}
    />
  );
}
