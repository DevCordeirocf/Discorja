import type { PeerMetrics } from '../shared/quality';

type Direction = PeerMetrics['direction'];
type Stat = {
  id: string;
  type: string;
  timestamp: number;
  [field: string]: unknown;
};

interface Snapshot {
  timestamp: number;
  bytes?: number;
  frames?: number;
  received?: number;
  lost?: number;
}

interface Baseline {
  scope: string;
  snapshot: Snapshot;
}

const MAX_BASELINES = 256;
const repairCodec = /^video\/(rtx|red|ulpfec|flexfec(?:-03)?)$/i;

function number(stat: Stat | undefined, field: string): number | undefined {
  const value = stat?.[field];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function count(stat: Stat | undefined, field: string): number | undefined {
  const value = number(stat, field);
  return value !== undefined && value >= 0 ? value : undefined;
}

function referenced(
  stats: Map<string, Stat>,
  stat: Stat | undefined,
  field: string,
  type: string,
): Stat | undefined {
  const id = stat?.[field];
  const result = typeof id === 'string' ? stats.get(id) : undefined;
  return result?.type === type ? result : undefined;
}

function snapshot(stat: Stat, direction: Direction): Snapshot {
  return {
    timestamp: stat.timestamp,
    bytes: count(
      stat,
      direction === 'outbound' ? 'bytesSent' : 'bytesReceived',
    ),
    frames: count(
      stat,
      direction === 'outbound' ? 'framesEncoded' : 'framesDecoded',
    ),
    received: count(stat, 'packetsReceived'),
    // packetsLost is signed in the specification; late arrivals can reduce it.
    lost: number(stat, 'packetsLost'),
  };
}

function delta(
  current: number | undefined,
  previous: number | undefined,
): number | undefined {
  return current !== undefined && previous !== undefined && current >= previous
    ? current - previous
    : undefined;
}

function reset(current: Snapshot, previous: Snapshot): boolean {
  return (['bytes', 'frames', 'received'] as const).some(
    (field) =>
      current[field] !== undefined &&
      previous[field] !== undefined &&
      current[field]! < previous[field]!,
  );
}

function loss(
  current: Snapshot,
  previous: Snapshot | undefined,
): number | undefined {
  if (
    !previous ||
    !Number.isFinite(current.timestamp) ||
    current.timestamp <= previous.timestamp ||
    reset(current, previous)
  )
    return;
  const received = delta(current.received, previous.received);
  const lost = delta(current.lost, previous.lost);
  if (received === undefined || lost === undefined || received + lost === 0)
    return;
  return (lost / (received + lost)) * 100;
}

function identity(scope: string, stat: Stat): string {
  // A track replacement or SSRC change starts a new measurement interval.
  return JSON.stringify([
    scope,
    stat.id,
    stat.ssrc,
    stat.trackIdentifier,
    stat.mediaSourceId,
  ]);
}

function selectedPair(stats: Map<string, Stat>, rtp: Stat): Stat | undefined {
  const transport = referenced(stats, rtp, 'transportId', 'transport');
  const pair = referenced(
    stats,
    transport,
    'selectedCandidatePairId',
    'candidate-pair',
  );
  if (
    !pair ||
    pair.state === 'failed' ||
    (pair.transportId !== undefined && pair.transportId !== transport?.id)
  )
    return;
  return pair;
}

function route(
  stats: Map<string, Stat>,
  pair: Stat | undefined,
): PeerMetrics['route'] {
  const local = referenced(stats, pair, 'localCandidateId', 'local-candidate');
  const remote = referenced(
    stats,
    pair,
    'remoteCandidateId',
    'remote-candidate',
  );
  if (local?.candidateType === 'relay' || remote?.candidateType === 'relay')
    return 'relay';
  const direct = new Set(['host', 'srflx', 'prflx']);
  return typeof local?.candidateType === 'string' &&
    direct.has(local.candidateType) &&
    typeof remote?.candidateType === 'string' &&
    direct.has(remote.candidateType)
    ? 'direct'
    : 'unknown';
}

function remoteInbound(stats: Map<string, Stat>, rtp: Stat): Stat | undefined {
  const matches = (remote: Stat | undefined): remote is Stat =>
    Boolean(
      remote?.type === 'remote-inbound-rtp' &&
      (remote.localId === undefined || remote.localId === rtp.id) &&
      (remote.ssrc === undefined ||
        rtp.ssrc === undefined ||
        remote.ssrc === rtp.ssrc),
    );
  const remote = referenced(stats, rtp, 'remoteId', 'remote-inbound-rtp');
  if (matches(remote)) return remote;
  // Some implementations expose only the reverse link.
  return [...stats.values()].find(
    (value) => value.localId === rtp.id && matches(value),
  );
}

/** Extracts video measurements without mixing counters from different RTP streams.
 * Field units/references follow https://www.w3.org/TR/webrtc-stats/.
 */
export class PeerTelemetry {
  private readonly previous = new Map<string, Baseline>();
  private readonly selected = new Map<string, string>();

  sample(
    report: RTCStatsReport,
    peerId: string,
    direction: Direction,
    timestamp = Date.now(),
  ): Partial<PeerMetrics> {
    const result: Partial<PeerMetrics> = {
      peerId,
      direction,
      timestamp,
      route: 'unknown',
    };
    const stats = new Map<string, Stat>();
    report.forEach((value) => {
      if (
        value &&
        typeof value.id === 'string' &&
        typeof value.type === 'string'
      ) {
        stats.set(value.id, value as Stat);
      }
    });
    const scope = JSON.stringify([peerId, direction]);
    const candidates = [...stats.values()].filter((stat) => {
      if (
        stat.type !== `${direction}-rtp` ||
        !Number.isFinite(stat.timestamp) ||
        stat.isRemote === true ||
        stat.active === false ||
        stat.ended === true
      )
        return false;
      const codec = referenced(stats, stat, 'codecId', 'codec');
      const mime = typeof codec?.mimeType === 'string' ? codec.mimeType : '';
      const kind = stat.kind ?? stat.mediaType;
      if (kind !== undefined ? kind !== 'video' : !mime.startsWith('video/'))
        return false;
      if (repairCodec.test(mime)) return false;
      const track = referenced(stats, stat, 'trackId', 'track');
      const source = referenced(stats, stat, 'mediaSourceId', 'media-source');
      const transport = referenced(stats, stat, 'transportId', 'transport');
      return (
        track?.ended !== true &&
        source?.ended !== true &&
        transport?.dtlsState !== 'closed' &&
        transport?.dtlsState !== 'failed' &&
        transport?.iceState !== 'closed' &&
        transport?.iceState !== 'failed'
      );
    });

    const rank = (stat: Stat): number[] => {
      const key = identity(scope, stat);
      const current = snapshot(stat, direction);
      const previous = this.previous.get(key)?.snapshot;
      const fresh =
        Number.isFinite(current.timestamp) &&
        (!previous || current.timestamp > previous.timestamp);
      const progressing =
        previous &&
        fresh &&
        !reset(current, previous) &&
        ((delta(current.bytes, previous.bytes) ?? 0) > 0 ||
          (delta(current.frames, previous.frames) ?? 0) > 0);
      const activity = progressing
        ? 3
        : fresh &&
            !previous &&
            ((current.bytes ?? 0) > 0 ||
              (current.frames ?? 0) > 0 ||
              (count(stat, 'framesPerSecond') ?? 0) > 0)
          ? 2
          : fresh
            ? 1
            : 0;
      return [
        activity,
        stat.active === true ? 1 : 0,
        count(stat, 'lastPacketReceivedTimestamp') ?? 0,
        Number.isFinite(stat.timestamp) ? stat.timestamp : 0,
        (count(stat, 'frameWidth') ?? 0) * (count(stat, 'frameHeight') ?? 0),
        this.selected.get(scope) === key ? 1 : 0,
      ];
    };
    candidates.sort((a, b) => {
      const left = rank(a);
      const right = rank(b);
      for (let index = 0; index < left.length; index++) {
        if (left[index] !== right[index]) return right[index] - left[index];
      }
      return a.id.localeCompare(b.id);
    });

    const rtp = candidates[0];
    const live = new Set<string>();
    if (rtp) {
      const key = identity(scope, rtp);
      this.selected.delete(scope);
      this.selected.set(scope, key);
      const current = snapshot(rtp, direction);
      const previous = this.previous.get(key)?.snapshot;
      const fresh =
        Number.isFinite(current.timestamp) &&
        (!previous || current.timestamp > previous.timestamp);
      const elapsed = previous ? current.timestamp - previous.timestamp : 0;
      const validInterval =
        previous && elapsed > 0 && !reset(current, previous);
      if (validInterval) {
        const bytes = delta(current.bytes, previous.bytes);
        const frames = delta(current.frames, previous.frames);
        if (bytes !== undefined)
          result.bitrateMbps = (bytes * 8) / elapsed / 1_000;
        if (frames !== undefined) result.fps = (frames * 1_000) / elapsed;
      }
      // Prefer the browser's measured encoded/decoded rate when provided.
      const fps = count(rtp, 'framesPerSecond');
      if (fresh && fps !== undefined) result.fps = fps;
      const width = count(rtp, 'frameWidth');
      const height = count(rtp, 'frameHeight');
      if (width !== undefined && width > 0) result.width = width;
      if (height !== undefined && height > 0) result.height = height;
      const codec = referenced(stats, rtp, 'codecId', 'codec');
      if (typeof codec?.mimeType === 'string' && codec.mimeType)
        result.codec = codec.mimeType;
      const pair = selectedPair(stats, rtp);
      for (const key of [
        'encoderImplementation',
        'decoderImplementation',
      ] as const) {
        const value = rtp[key];
        if (typeof value === 'string' && value.length <= 128)
          result[key] = value;
      }
      for (const key of [
        'powerEfficientEncoder',
        'powerEfficientDecoder',
      ] as const)
        if (typeof rtp[key] === 'boolean') result[key] = rtp[key];
      const jitter = count(rtp, 'jitter');
      if (jitter !== undefined) result.jitterMs = jitter * 1000;
      for (const key of [
        'framesDropped',
        'freezeCount',
        'totalFreezesDuration',
      ] as const) {
        const value = count(rtp, key);
        if (value !== undefined) result[key] = value;
      }
      const available = count(pair, 'availableOutgoingBitrate');
      if (available !== undefined)
        result.availableOutgoingMbps = available / 1_000_000;
      result.route = route(stats, pair);
      const remote =
        direction === 'outbound' ? remoteInbound(stats, rtp) : undefined;
      const remoteRtt =
        count(remote, 'roundTripTimeMeasurements') === 0
          ? undefined
          : count(remote, 'roundTripTime');
      const rtt = remoteRtt ?? count(pair, 'currentRoundTripTime');
      if (rtt !== undefined) result.rttMs = rtt * 1_000;

      if (direction === 'inbound') {
        const packetLoss = loss(current, previous);
        if (packetLoss !== undefined) result.packetLossPercent = packetLoss;
      } else {
        const limitation = rtp.qualityLimitationReason;
        if (
          limitation === 'none' ||
          limitation === 'cpu' ||
          limitation === 'bandwidth' ||
          limitation === 'other'
        )
          result.limitation = limitation;
        if (remote) {
          const remoteKey = identity(`${scope}:${key}`, remote);
          const remoteCurrent = snapshot(remote, 'inbound');
          const remotePrevious = this.previous.get(remoteKey)?.snapshot;
          const remoteFresh =
            Number.isFinite(remoteCurrent.timestamp) &&
            (!remotePrevious ||
              remoteCurrent.timestamp > remotePrevious.timestamp);
          let packetLoss = loss(remoteCurrent, remotePrevious);
          const missingCounters =
            !remotePrevious ||
            remoteCurrent.received === undefined ||
            remoteCurrent.lost === undefined ||
            remotePrevious.received === undefined ||
            remotePrevious.lost === undefined;
          if (packetLoss === undefined && remoteFresh && missingCounters) {
            const fraction = count(remote, 'fractionLost');
            if (fraction !== undefined && fraction <= 1)
              packetLoss = fraction * 100;
          }
          if (packetLoss !== undefined) result.packetLossPercent = packetLoss;
          this.remember(scope, remoteKey, remoteCurrent, live);
        }
      }
    } else {
      this.selected.delete(scope);
    }

    const audio = [...stats.values()]
      .filter(
        (stat) =>
          stat.type === `${direction}-rtp` &&
          (stat.kind ?? stat.mediaType) === 'audio' &&
          stat.isRemote !== true &&
          stat.active !== false &&
          stat.ended !== true &&
          Number.isFinite(stat.timestamp),
      )
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    if (audio) {
      const key = identity(`${scope}:audio`, audio);
      const current = snapshot(audio, direction);
      const previous = this.previous.get(key)?.snapshot;
      if (
        previous &&
        current.timestamp > previous.timestamp &&
        !reset(current, previous)
      ) {
        const bytes = delta(current.bytes, previous.bytes);
        if (bytes !== undefined)
          result.audioBitrateKbps =
            (bytes * 8) / (current.timestamp - previous.timestamp);
      }
      const codec = referenced(stats, audio, 'codecId', 'codec');
      if (
        typeof codec?.mimeType === 'string' &&
        /^audio\/(opus|pcmu|pcma)$/i.test(codec.mimeType)
      )
        result.audioCodec = codec.mimeType;
      const remote =
        direction === 'outbound' ? remoteInbound(stats, audio) : undefined;
      const measuredAudio = remote ?? audio;
      const jitter = count(measuredAudio, 'jitter');
      if (jitter !== undefined) result.audioJitterMs = jitter * 1000;
      if (direction === 'inbound') {
        result.audioPacketLossPercent = loss(current, previous);
        result.audioConcealedSamples = count(audio, 'concealedSamples');
        const delay = count(audio, 'jitterBufferDelay');
        const emitted = count(audio, 'jitterBufferEmittedCount');
        if (delay !== undefined && emitted && emitted > 0)
          result.audioBufferMs = (delay / emitted) * 1000;
      }
      this.remember(scope, key, current, live);
    }

    // Save every eligible stream so activity, rather than lifetime byte totals,
    // selects the current SSRC when Chrome briefly retains the previous one.
    for (const candidate of candidates)
      this.remember(
        scope,
        identity(scope, candidate),
        snapshot(candidate, direction),
        live,
      );
    for (const [key, baseline] of this.previous) {
      if (baseline.scope === scope && !live.has(key)) this.previous.delete(key);
    }
    while (this.previous.size > MAX_BASELINES)
      this.previous.delete(this.previous.keys().next().value!);
    while (this.selected.size > MAX_BASELINES)
      this.selected.delete(this.selected.keys().next().value!);
    return result;
  }

  private remember(
    scope: string,
    key: string,
    current: Snapshot,
    live: Set<string>,
  ): void {
    live.add(key);
    if (!Number.isFinite(current.timestamp)) return;
    const previous = this.previous.get(key)?.snapshot;
    // A cached or out-of-order report must not move the baseline backward.
    if (previous && current.timestamp <= previous.timestamp) return;
    this.previous.delete(key);
    this.previous.set(key, { scope, snapshot: current });
  }

  reset(): void {
    this.previous.clear();
    this.selected.clear();
  }
}
