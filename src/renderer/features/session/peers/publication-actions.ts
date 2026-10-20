import type { Publication } from '../../../../shared/protocol';

export function handlePublicationAction(options: {
  action?: string;
  publicationId?: string;
  peerId?: string;
  watching: Publication | null;
  selectPublication: (id: string | null, recovery?: boolean) => void;
  stopPublication: (peerId: string) => void;
}): boolean {
  switch (options.action) {
    case 'watch-screen':
      if (options.publicationId)
        options.selectPublication(
          options.publicationId === options.watching?.publicationId
            ? null
            : options.publicationId,
        );
      return true;
    case 'preview-own':
    case 'stop-watching':
      options.selectPublication(null);
      return true;
    case 'retry-watching':
      if (options.watching)
        options.selectPublication(options.watching.publicationId);
      return true;
    case 'stop-publication':
      if (options.peerId) options.stopPublication(options.peerId);
      return true;
    default:
      return false;
  }
}
