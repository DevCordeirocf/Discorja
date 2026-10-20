import type { DiscorjaAPI } from '../../shared/protocol';

export interface FilteredAudioPipeline {
  track: MediaStreamTrack;
  start(): Promise<number>;
  dispose(): Promise<void>;
}

export async function createFilteredAudioPipeline(
  api: DiscorjaAPI,
): Promise<FilteredAudioPipeline> {
  const context = new AudioContext({ sampleRate: 48_000 });
  let source: AudioWorkletNode | null = null;
  let destination: MediaStreamAudioDestinationNode | null = null;
  let started = false;
  let disposed = false;

  try {
    await context.audioWorklet.addModule(
      new URL('./audio-capture-worklet.js', window.location.href),
    );
    await context.resume();
    destination = context.createMediaStreamDestination();
    source = new AudioWorkletNode(context, 'discorja-filtered-audio', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    source.connect(destination);
    const node = source;
    const removeAudioListener = api.onFilteredAudioData((packet) => {
      if (disposed || node.port === null) return;
      const copy = packet.buffer.slice(
        packet.byteOffset,
        packet.byteOffset + packet.byteLength,
      );
      node.port.postMessage(copy, [copy]);
    });
    const track = destination.stream.getAudioTracks()[0];
    if (!track) throw new Error('O Windows não criou a faixa de áudio.');

    return {
      track,
      start: async () => {
        if (disposed) throw new Error('A captura de áudio foi cancelada.');
        const processId = await api.startDiscordAudioCapture();
        started = true;
        return processId;
      },
      dispose: async () => {
        if (disposed) return;
        disposed = true;
        removeAudioListener();
        source?.disconnect();
        destination?.stream.getTracks().forEach((item) => item.stop());
        if (started) await api.stopDiscordAudioCapture();
        if (context.state !== 'closed') await context.close();
      },
    };
  } catch (error) {
    source?.disconnect();
    destination?.stream.getTracks().forEach((item) => item.stop());
    if (context.state !== 'closed') await context.close();
    throw error;
  }
}
