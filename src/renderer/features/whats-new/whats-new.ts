import type { ChangelogEntry } from './changelog';

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

/** Compares release versions; null when either is not a plain x.y.z. */
export function compareVersions(a: string, b: string): number | null {
  const left = VERSION.exec(a);
  const right = VERSION.exec(b);
  if (!left || !right) return null;
  for (let index = 1; index <= 3; index++) {
    const difference = Number(left[index]) - Number(right[index]);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

export const isReleaseVersion = (value: string) => VERSION.test(value);

/**
 * Fresh installs only record the version: the notes are for people who
 * already used an earlier release.
 */
export function decideWhatsNew(options: {
  current: string;
  lastSeen: string | null;
  freshInstall: boolean;
}): 'show' | 'mark-seen' | 'none' {
  if (!isReleaseVersion(options.current)) return 'none';
  if (!options.lastSeen) return options.freshInstall ? 'mark-seen' : 'show';
  const order = compareVersions(options.current, options.lastSeen);
  if (order === null) return 'mark-seen';
  return order > 0 ? 'show' : 'none';
}

/** Entries newer than lastSeen up to current, newest first. */
export function entriesSince(
  changelog: readonly ChangelogEntry[],
  current: string,
  lastSeen: string | null,
  limit = 5,
): ChangelogEntry[] {
  return changelog
    .filter((entry) => (compareVersions(entry.version, current) ?? -1) <= 0)
    .filter(
      (entry) =>
        !lastSeen || (compareVersions(entry.version, lastSeen) ?? 0) > 0,
    )
    .slice(0, limit);
}
