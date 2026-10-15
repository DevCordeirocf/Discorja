// Instrument only test instances, before they create peers. No production debug API.
export async function installQualityProbe(page) {
  await page.evaluate(() => {
    const Original = window.RTCPeerConnection;
    window.__qualityProbe = { peers: [], iceRestarts: 0 };
    const getDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getDisplayMedia = async (options) => {
      const stream = await getDisplayMedia(options);
      const settings = stream.getVideoTracks()[0].getSettings();
      window.__qualityProbe.initialCapture = {
        width: settings.width,
        height: settings.height,
        frameRate: settings.frameRate,
      };
      return stream;
    };
    window.RTCPeerConnection = new Proxy(Original, {
      construct(Target, args) {
        const peer = Reflect.construct(Target, args);
        const createOffer = peer.createOffer.bind(peer);
        peer.createOffer = (options) => {
          if (options?.iceRestart) window.__qualityProbe.iceRestarts++;
          return createOffer(options);
        };
        window.__qualityProbe.peers.push(peer);
        return peer;
      },
    });
  });
}

export async function qualitySnapshot(page) {
  return page.evaluate(async () => {
    const peers = [];
    for (const connection of window.__qualityProbe.peers) {
      if (connection.connectionState === 'closed') continue;
      const report = await connection.getStats();
      const video = [];
      for (const stat of report.values()) {
        if (
          !['inbound-rtp', 'outbound-rtp'].includes(stat.type) ||
          (stat.kind ?? stat.mediaType) !== 'video'
        )
          continue;
        const codec = report.get(stat.codecId);
        if (
          codec?.mimeType &&
          /\/(rtx|red|ulpfec|flexfec)/i.test(codec.mimeType)
        )
          continue;
        video.push({
          direction: stat.type,
          width: stat.frameWidth,
          height: stat.frameHeight,
          fps: stat.framesPerSecond,
          frames: stat.framesDecoded ?? stat.framesEncoded,
          bytes: stat.bytesReceived ?? stat.bytesSent,
          packets: stat.packetsReceived ?? stat.packetsSent,
          packetsLost: stat.packetsLost,
          freezes: stat.freezeCount,
          limitation: stat.qualityLimitationReason,
          codec: codec?.mimeType,
          encoder: stat.encoderImplementation,
          powerEfficientEncoder: stat.powerEfficientEncoder,
        });
      }
      const senders = connection
        .getSenders()
        .filter((sender) => sender.track?.kind === 'video')
        .map((sender) => {
          const parameters = sender.getParameters();
          const source = sender.track.getSettings();
          const constraints = sender.track.getConstraints();
          return {
            source: {
              width: source.width,
              height: source.height,
              frameRate: source.frameRate,
              contentHint: sender.track.contentHint,
            },
            requested: {
              width: constraints.width,
              height: constraints.height,
              frameRate: constraints.frameRate,
            },
            degradationPreference: parameters.degradationPreference,
            encodings: parameters.encodings.map(
              ({ maxBitrate, maxFramerate, scaleResolutionDownBy }) => ({
                maxBitrate,
                maxFramerate,
                scaleResolutionDownBy,
              }),
            ),
          };
        });
      peers.push({ state: connection.connectionState, video, senders });
    }
    return {
      timestamp: Date.now(),
      initialCapture: window.__qualityProbe.initialCapture,
      iceRestarts: window.__qualityProbe.iceRestarts,
      peers,
    };
  });
}

export async function collectQuality(page, durationMs = 4500) {
  const start = await qualitySnapshot(page);
  await page.waitForTimeout(durationMs);
  const end = await qualitySnapshot(page);
  const seconds = (end.timestamp - start.timestamp) / 1000;
  const measured = end.peers.map((peer, index) => ({
    ...peer,
    video: peer.video.map((video, streamIndex) => {
      const previous = start.peers[index]?.video[streamIndex];
      return {
        ...video,
        measuredFps:
          previous && video.frames >= previous.frames
            ? (video.frames - previous.frames) / seconds
            : undefined,
        measuredMbps:
          previous && video.bytes >= previous.bytes
            ? ((video.bytes - previous.bytes) * 8) / seconds / 1e6
            : undefined,
        measuredLossPercent:
          previous &&
          video.packetsLost >= previous.packetsLost &&
          video.packets >= previous.packets &&
          video.packets -
            previous.packets +
            video.packetsLost -
            previous.packetsLost >
            0
            ? ((video.packetsLost - previous.packetsLost) /
                (video.packets -
                  previous.packets +
                  video.packetsLost -
                  previous.packetsLost)) *
              100
            : undefined,
      };
    }),
  }));
  return { ...end, durationSeconds: seconds, peers: measured };
}
