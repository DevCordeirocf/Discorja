import path from 'node:path';

export function trustedAppUrl(value: string, devUrl: string | null): boolean {
  try {
    const url = new URL(value);
    return (
      !url.username &&
      !url.password &&
      (devUrl
        ? url.origin === devUrl
        : url.protocol === 'app:' && url.host === 'discorja')
    );
  } catch {
    return false;
  }
}

export function rendererFile(root: string, value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!trustedAppUrl(value, null)) return;
    const decoded = decodeURIComponent(url.pathname);
    // Windows alternate streams, UNC paths, encoded separators and traversal.
    if (
      /[\\:\u0000]/.test(decoded) ||
      decoded.split('/').some((part) => part === '..' || part === '.')
    )
      return;
    const target = path.resolve(
      root,
      '.' + (decoded === '/' ? '/index.html' : decoded),
    );
    if (!target.startsWith(path.resolve(root) + path.sep)) return;
    if (
      ![
        '.html',
        '.js',
        '.css',
        '.svg',
        '.png',
        '.ico',
        '.woff',
        '.woff2',
        '.ttf',
        '.gif',
        '.webp',
        '.wav',
      ].includes(path.extname(target))
    )
      return;
    return target;
  } catch {
    return;
  }
}

/** Exact external pages the app may open in the browser. */
const EXTERNAL_PAGES = new Set([
  'https://github.com/DevCordeiroCf',
  'https://giphy.com/',
]);

/**
 * Right-click pastes like Ctrl+V, but only into an editable field that can
 * take the clipboard; the text never passes through the renderer.
 */
export function pasteOnContextMenu(params: {
  isEditable: boolean;
  editFlags: { canPaste: boolean };
  inputFieldType?: string;
}): boolean {
  return (
    params.isEditable &&
    params.editFlags.canPaste &&
    params.inputFieldType !== 'password'
  );
}

export function allowedExternalUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return;
    const normalized =
      url.pathname === '/'
        ? url.href
        : `${url.origin}${url.pathname.replace(/\/+$/u, '')}`;
    return EXTERNAL_PAGES.has(normalized) ? normalized : undefined;
  } catch {
    return;
  }
}

export function authorizedFrame(
  event: { sender: unknown; senderFrame: unknown },
  contents: { mainFrame: { url: string } },
  devUrl: string | null,
): boolean {
  return (
    event.sender === contents &&
    event.senderFrame === contents.mainFrame &&
    trustedAppUrl(contents.mainFrame.url, devUrl)
  );
}
