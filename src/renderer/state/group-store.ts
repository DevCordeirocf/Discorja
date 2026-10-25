import { MAX_LOCAL_GROUPS } from '../../shared/groups';
import { validGroupName } from '../features/groups/group-invite';
import type { StorageLike } from './preference-store';

export interface StoredGroup {
  secret: string;
  name: string;
  addedAt: number;
}

const KEY = 'discorja.groups';
const SECRET = /^[A-Za-z0-9_-]{22}$/u;

/** Groups live only in this app; the server keeps nothing about them. */
export function createGroupStore(storage?: StorageLike) {
  const read = (): StoredGroup[] => {
    try {
      const saved: unknown = JSON.parse(storage?.getItem(KEY) ?? 'null');
      if (
        !saved ||
        typeof saved !== 'object' ||
        (saved as { v?: unknown }).v !== 1 ||
        !Array.isArray((saved as { groups?: unknown }).groups)
      )
        return [];
      const seen = new Set<string>();
      return (saved as { groups: unknown[] }).groups
        .filter((entry): entry is StoredGroup => {
          if (!entry || typeof entry !== 'object') return false;
          const group = entry as Record<string, unknown>;
          if (
            typeof group.secret !== 'string' ||
            !SECRET.test(group.secret) ||
            typeof group.name !== 'string' ||
            !validGroupName(group.name) ||
            typeof group.addedAt !== 'number' ||
            seen.has(group.secret)
          )
            return false;
          seen.add(group.secret);
          return true;
        })
        .slice(0, MAX_LOCAL_GROUPS);
    } catch {
      return [];
    }
  };
  const write = (groups: StoredGroup[]) => {
    try {
      storage?.setItem(KEY, JSON.stringify({ v: 1, groups }));
    } catch {
      /* Groups still work for this session without storage. */
    }
  };
  return {
    list: read,
    /** Returns false when the group is already saved or the limit is reached. */
    add(group: { secret: string; name: string }, now = Date.now()): boolean {
      const groups = read();
      if (
        groups.some((entry) => entry.secret === group.secret) ||
        groups.length >= MAX_LOCAL_GROUPS
      )
        return false;
      write([...groups, { ...group, name: group.name.trim(), addedAt: now }]);
      return true;
    },
    remove(secret: string): void {
      write(read().filter((entry) => entry.secret !== secret));
    },
  };
}
