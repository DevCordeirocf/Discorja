import { GROUP_INVITE, GROUP_NAME_MAX } from '../../../shared/groups';
import { displayName } from '../../../shared/validation';

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');

const fromBase64Url = (text: string) =>
  Uint8Array.from(
    atob(text.replaceAll('-', '+').replaceAll('_', '/')),
    (char) => char.charCodeAt(0),
  );

/** 16 random bytes: knowing them is what makes someone a group member. */
export function createGroupSecret(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
}

export const validGroupName = (name: string) =>
  displayName(name) && name.trim().length <= GROUP_NAME_MAX;

export function encodeInvite(group: { secret: string; name: string }): string {
  return `DJG1.${group.secret}.${toBase64Url(new TextEncoder().encode(group.name.trim()))}`;
}

export function parseInvite(
  text: string,
): { secret: string; name: string } | null {
  const match = GROUP_INVITE.exec(text.trim());
  if (!match) return null;
  try {
    const name = new TextDecoder('utf-8', { fatal: true })
      .decode(fromBase64Url(match[2]))
      .trim();
    return validGroupName(name) ? { secret: match[1], name } : null;
  } catch {
    return null;
  }
}

/**
 * The server only ever sees this hash, so it can list a group's rooms without
 * learning the invite.
 */
export async function deriveGroupKey(secret: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`discorja-group-v1|${secret}`),
  );
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
