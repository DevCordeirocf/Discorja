import type { ClientMessage } from '../../../shared/protocol';
import { liveAudioTracks } from './media-tracks';

type Send = (message: ClientMessage) => boolean;

export function publishStartedCapture(options: {
  stream: MediaStream;
  multiRoom: boolean;
  send: Send;
  viewers: Map<
    string,
    { connected: boolean; failed: boolean; reconnecting: boolean }
  >;
  offerViewer: (peerId: string, stream: MediaStream) => void;
  setPublicationId: (id: string) => void;
  setPublicationConfirmed: (confirmed: boolean) => void;
  render: () => void;
}): boolean {
  if (options.multiRoom) {
    const publicationId = crypto.randomUUID();
    options.setPublicationId(publicationId);
    options.setPublicationConfirmed(false);
    options.send({
      type: 'publish-state',
      publicationId,
      sharing: true,
      audio: liveAudioTracks(options.stream).length > 0,
    });
    options.render();
    return true;
  }
  if (!options.send({ type: 'host-state', sharing: true })) return false;
  for (const [peerId, viewer] of options.viewers) {
    viewer.connected = false;
    viewer.failed = false;
    viewer.reconnecting = false;
    options.offerViewer(peerId, options.stream);
  }
  options.render();
  return true;
}
