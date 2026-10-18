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
        '.woff2',
        '.wav',
      ].includes(path.extname(target))
    )
      return;
    return target;
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
