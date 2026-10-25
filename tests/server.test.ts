import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { LogEvent } from '../src/shared/logs.js';
import {
  createSignalingServer,
  type SignalingOptions,
} from '../src/server/server.js';
import type {
  ClientMessage,
  ServerMessage,
  MultiRoomState,
} from '../src/shared/protocol.js';
import { MAX_PAYLOAD } from '../src/server/config.js';

type MessageOf<T extends ServerMessage['type']> = Extract<
  ServerMessage,
  { type: T }
>;
const services: ReturnType<typeof createSignalingServer>[] = [];
const sockets: WebSocket[] = [];

class Peer {
  readonly inbox: ServerMessage[] = [];
  private listeners = new Set<() => void>();
  constructor(readonly socket: WebSocket) {
    socket.on('message', (data) => {
      this.inbox.push(JSON.parse(data.toString()) as ServerMessage);
      for (const listener of this.listeners) listener();
    });
  }
  send(message: ClientMessage | Record<string, unknown>) {
    this.socket.send(JSON.stringify(message));
  }
  next<T extends ServerMessage['type']>(type: T): Promise<MessageOf<T>> {
    return new Promise((resolve, reject) => {
      const check = () => {
        const index = this.inbox.findIndex((message) => message.type === type);
        if (index < 0) return;
        const [message] = this.inbox.splice(index, 1);
        clearTimeout(timer);
        this.listeners.delete(check);
        resolve(message as MessageOf<T>);
      };
      const timer = setTimeout(() => {
        this.listeners.delete(check);
        reject(
          new Error(`Não recebeu ${type}. Fila: ${JSON.stringify(this.inbox)}`),
        );
      }, 2000);
      this.listeners.add(check);
      check();
    });
  }
}

async function start(options: SignalingOptions = {}) {
  const service = createSignalingServer({ resumeGraceMs: 0, ...options });
  services.push(service);
  await new Promise<void>((resolve) =>
    service.server.listen(0, '127.0.0.1', resolve),
  );
  const address = service.server.address();
  if (!address || typeof address === 'string')
    throw new Error('Endereço indisponível.');
  return {
    ...service,
    url: `ws://127.0.0.1:${address.port}`,
    httpUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function connect(
  url: string,
  origin = 'app://discorja',
  headers: Record<string, string> = {},
) {
  const socket = new WebSocket(url, { origin, headers });
  sockets.push(socket);
  const peer = new Peer(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return peer;
}

async function createRoom(host: Peer) {
  host.send({ type: 'create-room', name: 'Anfitrião' });
  return host.next('room-created');
}

async function join(viewer: Peer, code: string, name = 'Amigo') {
  viewer.send({ type: 'join-room', code, name });
  return viewer.next('room-joined');
}

async function modern(url: string, protocol: 2 | 3 | 4 | 5 = 2) {
  const peer = await connect(url);
  peer.send({ type: 'hello', protocol });
  expect(await peer.next('hello')).toEqual({ type: 'hello', protocol });
  return peer;
}
async function state(
  peer: Peer,
  predicate: (value: MessageOf<'room-state'>) => boolean = () => true,
) {
  for (let index = 0; index < 30; index++) {
    const value = await peer.next('room-state');
    if (predicate(value)) return value;
  }
  throw new Error('Snapshot esperado não recebido.');
}
async function modernRoom(owner: Peer) {
  owner.send({ type: 'create-room', name: 'Dono', roomName: 'Sala da turma' });
  return state(owner, (value) => value.reason === 'created');
}
async function modernJoin(peer: Peer, code: string, name = 'Amigo') {
  peer.send({ type: 'join-room', code, name });
  return state(peer, (value) => value.reason === 'joined');
}

describe('Salas do protocolo 2', () => {
  it('registra requisições HTTP e WebSocket sem expor os dados enviados', async () => {
    const logs: LogEvent[] = [];
    const { url, httpUrl } = await start({
      onLog: (event) => logs.push(event),
    });
    const peer = await modern(url, 3);
    peer.send({
      type: 'create-room',
      name: 'NOME-PRIVADO',
      roomName: 'SALA-PRIVADA',
    });
    await state(peer, (value) => value.reason === 'created');
    expect((await fetch(`${httpUrl}/health`)).status).toBe(200);

    const requests = logs.filter((entry) => entry.event === 'request.received');
    expect(requests).toEqual(
      expect.arrayContaining([
        {
          event: 'request.received',
          details: {
            channel: 'websocket',
            operation: 'handshake',
            statusCode: 101,
          },
        },
        {
          event: 'request.received',
          details: {
            channel: 'websocket-message',
            operation: 'hello',
            clientProtocol: 3,
          },
        },
        {
          event: 'request.received',
          details: {
            channel: 'websocket-message',
            operation: 'create-room',
            clientProtocol: 3,
          },
        },
        {
          event: 'request.received',
          details: {
            channel: 'http',
            operation: 'health',
            method: 'GET',
            statusCode: 200,
          },
        },
      ]),
    );
    expect(JSON.stringify(requests)).not.toMatch(/NOME-PRIVADO|SALA-PRIVADA/);
  });

  it('separa dono, transmissor e participante e restringe a negociação à publicação autorizada', async () => {
    const { url } = await start();
    const owner = await modern(url),
      publisher = await modern(url),
      member = await modern(url);
    const room = await modernRoom(owner);
    const joined = await modernJoin(publisher, room.code);
    await modernJoin(member, room.code, 'Espectador');
    owner.send({ type: 'set-publisher', peerId: joined.selfId });
    const selected = await state(
      owner,
      (value) => value.publisherId === joined.selfId,
    );
    expect(selected.ownerId).toBe(room.selfId);
    expect(selected.sharing).toBe(false);
    owner.send({ type: 'host-state', sharing: true });
    expect((await owner.next('error')).code).toBe('FORBIDDEN');
    publisher.send({ type: 'host-state', sharing: true });
    await state(owner, (value) => value.sharing);
    publisher.send({
      type: 'signal',
      peerId: room.selfId,
      signal: { type: 'offer', sdp: 'v=0' },
    });
    expect((await owner.next('signal')).peerId).toBe(joined.selfId);
    owner.send({
      type: 'signal',
      peerId: joined.selfId,
      signal: { type: 'answer', sdp: 'v=0' },
    });
    expect((await publisher.next('signal')).peerId).toBe(room.selfId);
    member.send({
      type: 'signal',
      peerId: room.selfId,
      signal: { type: 'offer', sdp: 'v=0' },
    });
    expect((await member.next('error')).code).toBe('PEER_NOT_FOUND');
    publisher.send({ type: 'close-room' });
    expect((await publisher.next('error')).code).toBe('FORBIDDEN');
  });
  it('concede e revoga moderação sem permitir escalar privilégios ou remover o dono', async () => {
    const { url } = await start();
    const owner = await modern(url),
      moderator = await modern(url),
      viewer = await modern(url);
    const room = await modernRoom(owner);
    const mod = await modernJoin(moderator, room.code);
    const target = await modernJoin(viewer, room.code, 'Outro');
    moderator.send({
      type: 'set-moderator',
      peerId: mod.selfId,
      enabled: true,
    });
    expect((await moderator.next('error')).code).toBe('FORBIDDEN');
    owner.send({ type: 'set-moderator', peerId: mod.selfId, enabled: true });
    await state(moderator, (value) =>
      value.participants.some(
        (member) => member.peerId === mod.selfId && member.role === 'moderator',
      ),
    );
    moderator.send({ type: 'kick', peerId: room.selfId });
    expect((await moderator.next('error')).code).toBe('FORBIDDEN');
    moderator.send({ type: 'set-publisher', peerId: target.selfId });
    await state(viewer, (value) => value.publisherId === target.selfId);
    owner.send({ type: 'set-moderator', peerId: mod.selfId, enabled: false });
    await state(
      moderator,
      (value) =>
        value.participants.find((member) => member.peerId === mod.selfId)
          ?.role === 'participant',
    );
    moderator.send({ type: 'kick', peerId: target.selfId });
    expect((await moderator.next('error')).code).toBe('FORBIDDEN');
    owner.send({ type: 'kick', peerId: target.selfId });
    await viewer.next('kicked');
    const after = await state(
      owner,
      (value) =>
        value.participants.length === 2 && value.publisherId === room.selfId,
    );
    expect(after.sharing).toBe(false);
    expect(
      after.participants.some((member) => member.peerId === target.selfId),
    ).toBe(false);
  });
  it('retoma a sessão com os papéis do servidor e revoga o token depois de sair', async () => {
    const { url } = await start({ resumeGraceMs: 20000 });
    const owner = await modern(url),
      publisher = await modern(url);
    const room = await modernRoom(owner);
    const joined = await modernJoin(publisher, room.code);
    owner.send({ type: 'set-publisher', peerId: joined.selfId });
    await state(publisher, (value) => value.publisherId === joined.selfId);
    publisher.socket.terminate();
    await state(owner, (value) =>
      value.participants.some(
        (member) => member.peerId === joined.selfId && !member.connected,
      ),
    );
    const returned = await modern(url);
    returned.send({ type: 'resume-room', token: joined.resumeToken });
    const resumed = await state(
      returned,
      (value) => value.reason === 'resumed',
    );
    expect(resumed.publisherId).toBe(joined.selfId);
    expect(resumed.ownerId).toBe(room.selfId);
    expect(resumed.resumeToken).not.toBe(joined.resumeToken);
    returned.send({ type: 'leave-room' });
    await state(owner, (value) => value.participants.length === 1);
    const attacker = await modern(url);
    attacker.send({ type: 'resume-room', token: resumed.resumeToken });
    expect((await attacker.next('error')).code).toBe('RESUME_REJECTED');
  });
  it('mantém salas e protocolos isolados e fecha a sala quando o dono sai', async () => {
    const { url } = await start();
    const owner = await modern(url),
      other = await modern(url),
      viewer = await modern(url),
      legacy = await connect(url);
    const room = await modernRoom(owner),
      outside = await modernRoom(other);
    const joined = await modernJoin(viewer, room.code);
    owner.send({ type: 'set-publisher', peerId: outside.selfId });
    expect((await owner.next('error')).code).toBe('PEER_NOT_FOUND');
    legacy.send({ type: 'join-room', code: room.code, name: 'Antigo' });
    expect((await legacy.next('error')).code).toBe('PROTOCOL_MISMATCH');
    const oldRoom = await createRoom(legacy);
    const modernClient = await modern(url);
    modernClient.send({ type: 'join-room', code: oldRoom.code, name: 'Novo' });
    expect((await modernClient.next('error')).code).toBe('PROTOCOL_MISMATCH');
    owner.send({ type: 'set-publisher', peerId: joined.selfId });
    await state(viewer, (value) => value.publisherId === joined.selfId);
    owner.send({ type: 'leave-room' });
    expect((await viewer.next('room-closed')).reason).toBe('host-left');
    modernClient.send({ type: 'join-room', code: room.code, name: 'Novo' });
    expect((await modernClient.next('error')).code).toBe('ROOM_NOT_FOUND');
  });
});

let watchSequence = 0;
async function multiSnapshot(
  peer: Peer,
  predicate: (value: MultiRoomState) => boolean = () => true,
) {
  return (await state(
    peer,
    (value) => value.protocol === 3 && predicate(value),
  )) as MultiRoomState;
}
async function publish(peer: Peer, id: string) {
  peer.send({
    type: 'publish-state',
    publicationId: id,
    sharing: true,
    audio: false,
  });
  return multiSnapshot(peer, (value) =>
    value.publications.some((entry) => entry.publicationId === id),
  );
}
async function watch(peer: Peer, id: string | null) {
  const requestId = `watch-${++watchSequence}`;
  peer.send({ type: 'watch-publication', publicationId: id, requestId });
  return multiSnapshot(peer, (value) => value.watchRequestId === requestId);
}

describe('Publicações e seleção única no protocolo 3', () => {
  it('retoma publicação e seleção, aplica moderação durante a queda e invalida token ao remover', async () => {
    const { url } = await start({ resumeGraceMs: 20000 });
    const owner = await modern(url, 3),
      member = await modern(url, 3),
      viewer = await modern(url, 3);
    const room = await modernRoom(owner);
    const joined = await modernJoin(member, room.code);
    await modernJoin(viewer, room.code, 'Espectador');
    await publish(owner, 'screen-owner');
    await publish(member, 'screen-member');
    await watch(member, 'screen-owner');
    await watch(viewer, 'screen-member');
    member.socket.terminate();
    const disconnected = await multiSnapshot(owner, (value) =>
      value.publications.some(
        (entry) => entry.publicationId === 'screen-member' && !entry.connected,
      ),
    );
    // A watcher inside the resume grace keeps its WebRTC link to the publisher.
    expect(disconnected.subscribers).toEqual([joined.selfId]);
    owner.send({ type: 'stop-publication', peerId: joined.selfId });
    expect(
      (await multiSnapshot(viewer, (value) => value.publications.length === 1))
        .watching,
    ).toBeNull();
    const returned = await modern(url, 3);
    returned.send({ type: 'resume-room', token: joined.resumeToken });
    const resumed = await multiSnapshot(
      returned,
      (value) => value.reason === 'resumed',
    );
    expect(resumed.selfId).toBe(joined.selfId);
    expect(resumed.watching).toBe('screen-owner');
    expect(resumed.publications).toHaveLength(1);
    expect(resumed.resumeToken).not.toBe(joined.resumeToken);
    await multiSnapshot(owner, (value) =>
      value.subscribers.includes(joined.selfId),
    );
    owner.send({ type: 'kick', peerId: joined.selfId });
    await returned.next('kicked');
    returned.socket.terminate();
    const attacker = await modern(url, 3);
    attacker.send({ type: 'resume-room', token: resumed.resumeToken });
    expect((await attacker.next('error')).code).toBe('RESUME_REJECTED');
  });
  it('permite duas publicações independentes e troca uma única assinatura por vez', async () => {
    const { url } = await start();
    const a = await modern(url, 3),
      b = await modern(url, 3),
      viewer = await modern(url, 3);
    const room = await modernRoom(a);
    const second = await modernJoin(b, room.code, 'Segundo');
    const joined = await modernJoin(viewer, room.code, 'Espectador');
    await publish(a, 'publication-A');
    const both = await publish(b, 'publication-B');
    expect(both.publications).toHaveLength(2);
    expect(both.watching).toBeNull();
    expect(both.subscribers).toEqual([]);
    expect((await watch(viewer, 'publication-A')).watching).toBe(
      'publication-A',
    );
    await multiSnapshot(a, (value) =>
      value.subscribers.includes(joined.selfId),
    );
    // Retry the same screen: the sender must close the old PC before offering again.
    await watch(viewer, 'publication-A');
    await multiSnapshot(
      a,
      (value) => !value.subscribers.includes(joined.selfId),
    );
    await multiSnapshot(a, (value) =>
      value.subscribers.includes(joined.selfId),
    );
    a.send({
      type: 'stream-signal',
      publicationId: 'publication-A',
      peerId: joined.selfId,
      signal: { type: 'offer', sdp: 'v=0' },
    });
    expect((await viewer.next('stream-signal')).publicationId).toBe(
      'publication-A',
    );
    expect((await watch(viewer, 'publication-B')).watching).toBe(
      'publication-B',
    );
    const noLongerWatching = await multiSnapshot(
      a,
      (value) =>
        value.publications.length === 2 &&
        !value.subscribers.includes(joined.selfId),
    );
    expect(
      noLongerWatching.publications.find(
        (entry) => entry.publicationId === 'publication-A',
      )?.watchers,
    ).toBe(0);
    a.send({
      type: 'stream-signal',
      publicationId: 'publication-A',
      peerId: joined.selfId,
      signal: { type: 'ice', candidate: { candidate: '' } },
    });
    expect((await a.next('error')).code).toBe('FORBIDDEN_SIGNAL');
    b.send({
      type: 'stream-signal',
      publicationId: 'publication-B',
      peerId: joined.selfId,
      signal: { type: 'offer', sdp: 'v=0' },
    });
    expect((await viewer.next('stream-signal')).peerId).toBe(second.selfId);
    await watch(a, 'publication-B');
    expect(
      (await multiSnapshot(b, (value) => value.subscribers.length === 2))
        .publications,
    ).toHaveLength(2);
    expect((await watch(viewer, null)).watching).toBeNull();
  });
  it('aplica limite, rejeita publicação obsoleta e mantém a outra tela ao parar uma delas', async () => {
    const { url, httpUrl } = await start({
      statsToken: 'd'.repeat(64),
      maxPublishers: 2,
    });
    const a = await modern(url, 3),
      b = await modern(url, 3),
      c = await modern(url, 3);
    const room = await modernRoom(a);
    const second = await modernJoin(b, room.code);
    await modernJoin(c, room.code, 'Terceiro');
    await publish(a, 'publication-A');
    await publish(b, 'publication-B');
    c.send({
      type: 'publish-state',
      publicationId: 'publication-C',
      sharing: true,
      audio: false,
    });
    expect((await c.next('error')).code).toBe('PUBLICATION_LIMIT');
    a.send({
      type: 'publish-state',
      publicationId: 'obsolete',
      sharing: false,
      audio: false,
    });
    expect((await a.next('error')).code).toBe('STALE_PUBLICATION');
    await watch(c, 'publication-B');
    c.send({ type: 'stop-publication', peerId: room.selfId });
    expect((await c.next('error')).code).toBe('FORBIDDEN');
    const response = await fetch(`${httpUrl}/api/stats`, {
      headers: { Authorization: `Bearer ${'d'.repeat(64)}` },
    });
    expect((await response.json()).reportedScreenPublishers).toBe(2);
    a.send({ type: 'stop-publication', peerId: second.selfId });
    const after = await multiSnapshot(
      c,
      (value) => value.publications.length === 1,
    );
    expect(after.watching).toBeNull();
    expect(after.publications[0].publicationId).toBe('publication-A');
  });
  it('permite que os dez participantes publiquem simultaneamente no limite máximo', async () => {
    const { url } = await start({ maxPublishers: 10 });
    const peers = await Promise.all(
      Array.from({ length: 10 }, () => modern(url, 3)),
    );
    const room = await modernRoom(peers[0]);
    for (let index = 1; index < peers.length; index++)
      await modernJoin(peers[index], room.code, `Participante ${index + 1}`);

    for (let index = 0; index < peers.length; index++)
      await publish(peers[index], `publication-${index + 1}`);

    const full = await multiSnapshot(
      peers[0],
      (snapshot) => snapshot.publications.length === 10,
    );
    expect(full.maxPublishers).toBe(10);
    expect(full.participants).toHaveLength(10);
    expect(
      new Set(full.publications.map((entry) => entry.publisherId)).size,
    ).toBe(10);
  });
  it('bloqueia autoassinatura, negociação sem assinatura e sinais entre salas', async () => {
    const { url } = await start();
    const a = await modern(url, 3),
      viewer = await modern(url, 3),
      outside = await modern(url, 3);
    const room = await modernRoom(a);
    const joined = await modernJoin(viewer, room.code);
    await modernRoom(outside);
    await publish(a, 'publication-A');
    a.send({
      type: 'watch-publication',
      publicationId: 'publication-A',
      requestId: 'self-watch',
    });
    expect((await a.next('error')).code).toBe('PUBLICATION_NOT_FOUND');
    a.send({
      type: 'stream-signal',
      publicationId: 'publication-A',
      peerId: joined.selfId,
      signal: { type: 'offer', sdp: 'v=0' },
    });
    expect((await a.next('error')).code).toBe('FORBIDDEN_SIGNAL');
    outside.send({
      type: 'watch-publication',
      publicationId: 'publication-A',
      requestId: 'cross-room',
    });
    expect((await outside.next('error')).code).toBe('PUBLICATION_NOT_FOUND');
    await watch(viewer, 'publication-A');
    viewer.send({
      type: 'stream-signal',
      publicationId: 'publication-A',
      peerId: room.selfId,
      signal: { type: 'offer', sdp: 'v=0' },
    });
    expect((await viewer.next('error')).code).toBe('FORBIDDEN_SIGNAL');
    viewer.send({
      type: 'stream-signal',
      publicationId: 'obsolete',
      peerId: room.selfId,
      signal: { type: 'answer', sdp: 'v=0' },
    });
    expect((await viewer.next('error')).code).toBe('FORBIDDEN_SIGNAL');
  });
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await Promise.all(services.splice(0).map((service) => service.close()));
});

describe('sinalização Discorja', () => {
  it('limita cada sala a dez participantes no total', () => {
    expect(() => createSignalingServer({ maxViewers: 10 })).toThrow(
      /maxViewers deve ser no máximo 9/,
    );
  });

  it('conta somente conexões abertas durante retomada e limpa salas expiradas', async () => {
    let time = 100000;
    const statsToken = 'c'.repeat(64);
    const { url, httpUrl } = await start({
      statsToken,
      resumeGraceMs: 20000,
      roomTtlMs: 60000,
      now: () => time,
    });
    const read = async () =>
      (
        await fetch(`${httpUrl}/api/stats`, {
          headers: { Authorization: `Bearer ${statsToken}` },
        })
      ).json();
    const host = await connect(url),
      viewer = await connect(url);
    const room = await createRoom(host);
    const joined = await join(viewer, room.code);
    viewer.socket.terminate();
    await host.next('viewer-left');
    expect(await read()).toMatchObject({
      websocketConnections: 1,
      participantSessions: 1,
      roomMemberships: 1,
      activeRooms: 1,
    });
    const returned = await connect(url);
    returned.send({ type: 'resume-room', token: joined.resumeToken! });
    await returned.next('room-resumed');
    expect(await read()).toMatchObject({
      websocketConnections: 2,
      participantSessions: 2,
      roomMemberships: 2,
    });
    time += 60001;
    expect(await read()).toMatchObject({
      websocketConnections: 2,
      participantSessions: 0,
      activeRooms: 0,
      reportedScreenPublishers: 0,
    });
    expect(
      (
        await fetch(`${httpUrl}/api/stats`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${statsToken}` },
        })
      ).status,
    ).toBe(405);
  });
  it('protege estatísticas, conta conexões/salas e elimina vínculos ao expulsar', async () => {
    const statsToken = 'a'.repeat(64);
    const { url, httpUrl } = await start({ statsToken });
    const read = () =>
      fetch(`${httpUrl}/api/stats`, {
        headers: { Authorization: `Bearer ${statsToken}` },
      });
    expect((await fetch(`${httpUrl}/api/stats`)).status).toBe(401);
    expect(
      (
        await fetch(`${httpUrl}/api/stats`, {
          headers: { Authorization: 'Bearer wrong' },
        })
      ).status,
    ).toBe(401);
    const host = await connect(url),
      viewer = await connect(url),
      outside = await connect(url);
    const room = await createRoom(host);
    const member = await join(viewer, room.code);
    host.send({ type: 'host-state', sharing: true });
    await viewer.next('host-state');
    let response = await read();
    expect(response.headers.get('cache-control')).toBe('no-store');
    const data = await response.json();
    expect(data).toMatchObject({
      schemaVersion: 1,
      scope: 'instance',
      websocketConnections: 3,
      participantSessions: 2,
      roomMemberships: 2,
      activeRooms: 1,
      reportedScreenPublishers: 1,
    });
    expect(JSON.stringify(data)).not.toContain(room.code);
    expect(JSON.stringify(data)).not.toContain(statsToken);
    host.send({ type: 'kick', peerId: member.selfId });
    await viewer.next('kicked');
    expect(await (await read()).json()).toMatchObject({
      participantSessions: 1,
    });
    host.send({ type: 'close-room' });
    await host.next('room-closed');
    expect(await (await read()).json()).toMatchObject({
      activeRooms: 0,
      participantSessions: 0,
    });
    outside.socket.terminate();
  });
  it('desabilita estatísticas sem segredo e limita consultas mesmo sem autorização', async () => {
    const disabled = await start();
    expect((await fetch(`${disabled.httpUrl}/api/stats`)).status).toBe(404);
    expect(() => createSignalingServer({ statsToken: 'short' })).toThrow(
      /STATS_TOKEN/,
    );
    const { httpUrl } = await start({ statsToken: 'b'.repeat(32) });
    for (let i = 0; i < 30; i++)
      expect((await fetch(`${httpUrl}/api/stats`)).status).toBe(401);
    expect((await fetch(`${httpUrl}/api/stats`)).status).toBe(429);
    expect((await fetch(`${httpUrl}/health`)).status).toBe(200);
  });
  it('retoma sessão com token rotacionado sem aceitar papel informado pelo cliente', async () => {
    const { url } = await start({ resumeGraceMs: 20000 });
    const host = await connect(url),
      viewer = await connect(url);
    const room = await createRoom(host);
    const joined = await join(viewer, room.code);
    viewer.socket.terminate();
    await host.next('viewer-left');
    const replacement = await connect(url);
    replacement.send({ type: 'resume-room', token: joined.resumeToken! });
    const resumed = await replacement.next('room-resumed');
    expect(resumed).toMatchObject({
      selfId: joined.selfId,
      role: 'viewer',
      code: room.code,
    });
    expect(resumed.resumeToken).not.toBe(joined.resumeToken);
    const attacker = await connect(url);
    attacker.send({ type: 'resume-room', token: joined.resumeToken! });
    expect(await attacker.next('error')).toMatchObject({
      code: 'RESUME_REJECTED',
    });
    attacker.send({
      type: 'resume-room',
      token: resumed.resumeToken,
      role: 'host',
    });
    expect(await attacker.next('error')).toMatchObject({
      code: 'INVALID_MESSAGE',
    });
    host.send({ type: 'kick', peerId: joined.selfId });
    await replacement.next('kicked');
    replacement.socket.terminate();
    attacker.send({ type: 'resume-room', token: resumed.resumeToken });
    expect(await attacker.next('error')).toMatchObject({
      code: 'RESUME_REJECTED',
    });
  });
  it('retoma anfitrião com estado preservado e recusa retomada após expiração', async () => {
    let now = 100000;
    const { url } = await start({ resumeGraceMs: 20000, now: () => now });
    const host = await connect(url),
      viewer = await connect(url);
    const room = await createRoom(host);
    await join(viewer, room.code);
    host.send({ type: 'host-state', sharing: true });
    await viewer.next('host-state');
    host.socket.terminate();
    expect(await viewer.next('host-state')).toMatchObject({ sharing: false });
    const returned = await connect(url);
    returned.send({ type: 'resume-room', token: room.resumeToken! });
    const resumed = await returned.next('room-resumed');
    expect(resumed).toMatchObject({
      role: 'host',
      selfId: room.selfId,
      sharing: true,
    });
    expect(resumed.viewers).toHaveLength(1);
    await viewer.next('host-state');
    returned.socket.terminate();
    await viewer.next('host-state');
    now += 20001;
    const expired = await connect(url);
    expired.send({ type: 'resume-room', token: resumed.resumeToken });
    expect(await expired.next('error')).toMatchObject({
      code: 'RESUME_REJECTED',
    });
    expect(await viewer.next('room-closed')).toMatchObject({
      reason: 'host-left',
    });
  });
  it('fecha conexão após mensagens inválidas repetidas', async () => {
    const { url } = await start();
    const peer = await connect(url);
    const closed = new Promise<number>((resolve) =>
      peer.socket.once('close', resolve),
    );
    for (let i = 0; i < 3; i++) peer.socket.send('{}');
    expect(await closed).toBe(1008);
  });
  it('conecta anfitrião e dois espectadores e encaminha SDP/ICE', async () => {
    const { url, httpUrl } = await start();
    const [host, one, two] = await Promise.all([
      connect(url),
      connect(url),
      connect(url),
    ]);
    const room = await createRoom(host);
    expect(room.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/u);
    expect(room.maxViewers).toBe(9);
    const first = await join(one, room.code, 'Ana');
    expect(first).toMatchObject({
      hostId: room.selfId,
      hostName: 'Anfitrião',
      sharing: false,
    });
    host.send({ type: 'host-state', sharing: true });
    expect(await one.next('host-state')).toMatchObject({ sharing: true });
    const second = await join(two, room.code, 'Beto');
    expect(second.sharing).toBe(true);
    expect(await host.next('viewer-joined')).toEqual({
      type: 'viewer-joined',
      peerId: first.selfId,
      name: 'Ana',
    });
    expect(await host.next('viewer-joined')).toEqual({
      type: 'viewer-joined',
      peerId: second.selfId,
      name: 'Beto',
    });
    host.send({
      type: 'signal',
      peerId: first.selfId,
      signal: { type: 'offer', sdp: 'v=0\r\n' },
    });
    expect(await one.next('signal')).toEqual({
      type: 'signal',
      peerId: room.selfId,
      signal: { type: 'offer', sdp: 'v=0\r\n' },
    });
    one.send({
      type: 'signal',
      peerId: room.selfId,
      signal: { type: 'answer', sdp: 'v=0 answer' },
    });
    expect(await host.next('signal')).toMatchObject({
      peerId: first.selfId,
      signal: { type: 'answer', sdp: 'v=0 answer' },
    });
    two.send({
      type: 'signal',
      peerId: room.selfId,
      signal: {
        type: 'ice',
        candidate: { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 },
      },
    });
    expect(await host.next('signal')).toMatchObject({
      peerId: second.selfId,
      signal: { type: 'ice', candidate: { candidate: 'candidate:1' } },
    });
    host.send({ type: 'host-state', sharing: false });
    expect(await one.next('host-state')).toEqual({
      type: 'host-state',
      sharing: false,
    });
    expect(await two.next('host-state')).toEqual({
      type: 'host-state',
      sharing: false,
    });
    const health = await fetch(`${httpUrl}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });
  });

  it('limita espectadores e recusa associação repetida sem perder a sala atual', async () => {
    const { url } = await start({ maxViewers: 1 });
    const [host, one, two] = await Promise.all([
      connect(url),
      connect(url),
      connect(url),
    ]);
    const room = await createRoom(host);
    const viewer = await join(one, room.code);
    two.send({ type: 'join-room', code: room.code, name: 'Extra' });
    expect(await two.next('error')).toMatchObject({ code: 'ROOM_FULL' });
    one.send({ type: 'create-room', name: 'Outra' });
    expect(await one.next('error')).toMatchObject({ code: 'ALREADY_IN_ROOM' });
    host.send({ type: 'join-room', code: room.code, name: 'Outra' });
    expect(await host.next('error')).toMatchObject({ code: 'ALREADY_IN_ROOM' });
    host.send({
      type: 'signal',
      peerId: viewer.selfId,
      signal: { type: 'offer', sdp: 'ainda conectado' },
    });
    expect(await one.next('signal')).toMatchObject({
      signal: { sdp: 'ainda conectado' },
    });
  });

  it('isola salas, não permite espectadores conversarem entre si ou falsificarem remetentes', async () => {
    const { url } = await start();
    const [host, outsiderHost, one, two] = await Promise.all([
      connect(url),
      connect(url),
      connect(url),
      connect(url),
    ]);
    const room = await createRoom(host);
    const outside = await createRoom(outsiderHost);
    const first = await join(one, room.code);
    const second = await join(two, room.code);
    host.send({
      type: 'signal',
      peerId: outside.selfId,
      signal: { type: 'offer', sdp: 'v=0' },
    });
    expect(await host.next('error')).toMatchObject({ code: 'PEER_NOT_FOUND' });
    one.send({
      type: 'signal',
      peerId: second.selfId,
      signal: { type: 'ice', candidate: { candidate: '' } },
    });
    expect(await one.next('error')).toMatchObject({ code: 'PEER_NOT_FOUND' });
    one.send({
      type: 'signal',
      peerId: room.selfId,
      from: first.selfId,
      signal: { type: 'answer', sdp: 'v=0' },
    });
    expect(await one.next('error')).toMatchObject({ code: 'INVALID_MESSAGE' });
    one.send({
      type: 'signal',
      peerId: room.selfId,
      signal: { type: 'offer', sdp: 'v=0' },
    });
    expect(await one.next('error')).toMatchObject({ code: 'FORBIDDEN' });
    host.send({
      type: 'signal',
      peerId: first.selfId,
      signal: { type: 'answer', sdp: 'v=0' },
    });
    expect(await host.next('error')).toMatchObject({ code: 'FORBIDDEN' });
    expect(outsiderHost.inbox).toEqual([]);
    expect(two.inbox.filter((message) => message.type === 'signal')).toEqual(
      [],
    );
  });

  it('restringe controles ao anfitrião, remove espectadores e libera a vaga', async () => {
    const { url } = await start({ maxViewers: 1 });
    const [host, one, two] = await Promise.all([
      connect(url),
      connect(url),
      connect(url),
    ]);
    const room = await createRoom(host);
    const first = await join(one, room.code);
    for (const message of [
      { type: 'host-state', sharing: true },
      { type: 'kick', peerId: room.selfId },
      { type: 'close-room' },
    ]) {
      one.send(message);
      expect(await one.next('error')).toMatchObject({ code: 'FORBIDDEN' });
    }
    host.send({ type: 'kick', peerId: first.selfId });
    expect(await one.next('kicked')).toEqual({ type: 'kicked' });
    expect(await host.next('viewer-left')).toEqual({
      type: 'viewer-left',
      peerId: first.selfId,
    });
    one.send({
      type: 'signal',
      peerId: room.selfId,
      signal: { type: 'answer', sdp: 'v=0' },
    });
    expect(await one.next('error')).toMatchObject({ code: 'NOT_IN_ROOM' });
    // A code is an invitation, not an identity ban. Closing the room revokes the invitation.
    await join(one, room.code);
    one.send({ type: 'leave-room' });
    await host.next('viewer-left');
    await join(two, room.code);
    host.send({ type: 'close-room' });
    expect(await two.next('room-closed')).toMatchObject({
      reason: 'host-closed',
    });
    expect(await host.next('room-closed')).toMatchObject({
      reason: 'host-closed',
    });
    one.send({ type: 'join-room', code: room.code, name: 'De volta' });
    expect(await one.next('error')).toMatchObject({ code: 'ROOM_NOT_FOUND' });
  });

  it.each([1, 2, 3] as const)(
    'mantém a sala sem interação após 20 minutos no protocolo %i e respeita o prazo padrão de quatro horas',
    async (protocol) => {
      const createdAt = 1000;
      let clock = createdAt;
      const logs: LogEvent[] = [];
      const statsToken = 'test-room-duration-'.padEnd(32, 'x');
      const { url, httpUrl } = await start({
        now: () => clock,
        statsToken,
        onLog: (event) => logs.push(event),
      });
      const roomCount = async () => {
        const response = await fetch(`${httpUrl}/api/stats`, {
          headers: { Authorization: `Bearer ${statsToken}` },
        });
        expect(response.status).toBe(200);
        return (await response.json()).activeRooms;
      };
      const host =
        protocol === 1 ? await connect(url) : await modern(url, protocol);
      const room =
        protocol === 1 ? await createRoom(host) : await modernRoom(host);

      // Administrative stats run expiry cleanup without participant messages.
      clock = createdAt + 21 * 60 * 1000;
      expect(await roomCount()).toBe(1);

      // A new participant must still be able to join the same idle room.
      const viewer =
        protocol === 1 ? await connect(url) : await modern(url, protocol);
      if (protocol === 1) await join(viewer, room.code);
      else await modernJoin(viewer, room.code);

      clock = createdAt + 4 * 60 * 60 * 1000 - 1;
      expect(await roomCount()).toBe(1);
      clock += 1;
      expect(await roomCount()).toBe(0);
      const ended = logs.find((entry) => entry.event === 'room.ended');
      expect(ended?.details).toMatchObject({
        reason: 'expired',
        durationMs: 14400000,
        protocol,
        participants: 2,
      });
      expect(ended?.details?.roomId).toMatch(/^[a-f0-9-]{36}$/);
      expect(JSON.stringify(logs)).not.toContain(room.code);
      expect(await host.next('room-closed')).toMatchObject({
        reason: 'expired',
      });
      expect(await viewer.next('room-closed')).toMatchObject({
        reason: 'expired',
      });
    },
  );

  it('encerra salas expiradas, apaga associações e permite criar outra sala', async () => {
    let clock = 1000;
    const { url } = await start({
      roomTtlMs: 100,
      cleanupIntervalMs: 10,
      now: () => clock,
    });
    const [host, viewer] = await Promise.all([connect(url), connect(url)]);
    const room = await createRoom(host);
    await join(viewer, room.code);
    clock += 101;
    expect(await viewer.next('room-closed')).toMatchObject({
      reason: 'expired',
    });
    expect(await host.next('room-closed')).toMatchObject({ reason: 'expired' });
    viewer.send({ type: 'join-room', code: room.code, name: 'Amigo' });
    expect(await viewer.next('error')).toMatchObject({
      code: 'ROOM_NOT_FOUND',
    });
    expect((await createRoom(host)).code).toHaveLength(8);
  });

  it('limpa espectadores desconectados e encerra a sala quando o anfitrião sai', async () => {
    const { url } = await start({ maxViewers: 1 });
    const [host, one, two] = await Promise.all([
      connect(url),
      connect(url),
      connect(url),
    ]);
    const room = await createRoom(host);
    const first = await join(one, room.code);
    one.socket.terminate();
    expect(await host.next('viewer-left')).toEqual({
      type: 'viewer-left',
      peerId: first.selfId,
    });
    await join(two, room.code);
    host.socket.terminate();
    expect(await two.next('room-closed')).toMatchObject({
      reason: 'host-left',
    });
    two.send({ type: 'join-room', code: room.code, name: 'Amigo' });
    expect(await two.next('error')).toMatchObject({ code: 'ROOM_NOT_FOUND' });
  });

  it('permite sair voluntariamente e avisa os participantes ao encerrar', async () => {
    const { url } = await start();
    const [host, viewer] = await Promise.all([connect(url), connect(url)]);
    const room = await createRoom(host);
    const joined = await join(viewer, room.code);
    viewer.send({ type: 'leave-room' });
    expect(await host.next('viewer-left')).toMatchObject({
      peerId: joined.selfId,
    });
    await join(viewer, room.code);
    host.send({ type: 'leave-room' });
    expect(await viewer.next('room-closed')).toMatchObject({
      reason: 'host-left',
    });
    expect((await createRoom(host)).code).toHaveLength(8);
  });

  it('rejeita JSON, tipos, campos extras e tamanhos inválidos', async () => {
    const { url } = await start();
    const peer = await connect(url);
    peer.socket.send('{');
    expect(await peer.next('error')).toMatchObject({ code: 'INVALID_MESSAGE' });
    peer.socket.send(Buffer.from('{}'));
    expect(await peer.next('error')).toMatchObject({ code: 'INVALID_MESSAGE' });
    const invalid = [
      null,
      [],
      { type: 'create-room', name: '' },
      { type: 'create-room', name: 'a'.repeat(41) },
      { type: 'create-room', name: 'Ana', admin: true },
      { type: 'join-room', code: '123', name: 'Ana' },
      { type: 'host-state', sharing: 'true' },
      {
        type: 'signal',
        peerId: 'abc',
        signal: { type: 'offer', sdp: 'a'.repeat(56_001) },
      },
      {
        type: 'signal',
        peerId: 'abc',
        signal: {
          type: 'ice',
          candidate: { candidate: 'x', sdpMLineIndex: -1 },
        },
      },
    ];
    for (const message of invalid) {
      const peer = await connect(url);
      peer.socket.send(JSON.stringify(message));
      expect(await peer.next('error')).toMatchObject({
        code: 'INVALID_MESSAGE',
      });
    }
    const oversizedPeer = await connect(url);
    const oversized = new Promise<number>((resolve) =>
      oversizedPeer.socket.once('close', resolve),
    );
    oversizedPeer.socket.send('a'.repeat(MAX_PAYLOAD + 1));
    expect(await oversized).toBe(1009);
  });

  it('recusa origins não permitidos e conexões sem origin', async () => {
    const { url } = await start();
    await expect(connect(url, 'https://evil.example')).rejects.toThrow('403');
    const socket = new WebSocket(url);
    sockets.push(socket);
    await expect(
      new Promise<void>((resolve, reject) => {
        socket.once('open', resolve);
        socket.once('error', reject);
      }),
    ).rejects.toThrow('403');
    await expect(connect(`${url}/unexpected`)).rejects.toThrow('404');
  });

  it('limita tentativas por socket e por IP, incluindo conexões', async () => {
    const { url } = await start({
      rateLimits: {
        socketJoins: { max: 1, windowMs: 60_000 },
        ipJoins: { max: 2, windowMs: 60_000 },
        ipConnections: { max: 3, windowMs: 60_000 },
      },
    });
    const [one, two, three] = await Promise.all([
      connect(url),
      connect(url),
      connect(url),
    ]);
    const attempt = { type: 'join-room', code: 'ABCDEFGH', name: 'Amigo' };
    one.send(attempt);
    expect(await one.next('error')).toMatchObject({ code: 'ROOM_NOT_FOUND' });
    one.send(attempt);
    expect(await one.next('error')).toMatchObject({ code: 'RATE_LIMITED' });
    two.send(attempt);
    expect(await two.next('error')).toMatchObject({ code: 'ROOM_NOT_FOUND' });
    three.send(attempt);
    expect(await three.next('error')).toMatchObject({ code: 'RATE_LIMITED' });
    await expect(connect(url)).rejects.toThrow('429');
  });

  it('limita mensagens por socket e o total por IP', async () => {
    const { url } = await start({
      rateLimits: {
        socketMessages: { max: 1, windowMs: 60_000 },
        ipMessages: { max: 2, windowMs: 60_000 },
      },
    });
    const [one, two, three] = await Promise.all([
      connect(url),
      connect(url),
      connect(url),
    ]);
    one.send({ type: 'leave-room' });
    expect(await one.next('error')).toMatchObject({ code: 'NOT_IN_ROOM' });
    one.send({ type: 'leave-room' });
    expect(await one.next('error')).toMatchObject({ code: 'RATE_LIMITED' });
    two.send({ type: 'leave-room' });
    expect(await two.next('error')).toMatchObject({ code: 'NOT_IN_ROOM' });
    three.send({ type: 'leave-room' });
    expect(await three.next('error')).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('impõe limites globais de salas e clientes', async () => {
    const { url } = await start({ maxRooms: 1, maxClients: 2 });
    const [one, two] = await Promise.all([connect(url), connect(url)]);
    await createRoom(one);
    two.send({ type: 'create-room', name: 'Outra sala' });
    expect(await two.next('error')).toMatchObject({ code: 'SERVER_FULL' });
    await expect(connect(url)).rejects.toThrow('503');
  });

  it('remove sockets sem pong e limpa suas salas', async () => {
    const logs: LogEvent[] = [];
    const { url, wss } = await start({
      heartbeatIntervalMs: 30,
      onLog: (event) => logs.push(event),
    });
    const host = await connect(url);
    const viewer = await connect(url);
    const room = await createRoom(host);
    await join(viewer, room.code);
    // Simulate an unreachable host without relying on ws client auto-pong configuration.
    const serverHost = [...wss.clients][0];
    serverHost.removeAllListeners('pong');
    expect(await viewer.next('room-closed')).toMatchObject({
      reason: 'host-left',
    });
    expect(
      logs.some((entry) => entry.event === 'connection.heartbeat-timeout'),
    ).toBe(true);
    expect(
      logs.find((entry) => entry.event === 'room.ended')?.details?.reason,
    ).toBe('host-left');
  });
  it('preserva a sala quando o consumidor de logs falha', async () => {
    const { url } = await start({
      onLog: () => {
        throw new Error('fixture');
      },
    });
    const host = await connect(url);
    const room = await createRoom(host);
    const viewer = await connect(url);
    await join(viewer, room.code);
    host.send({ type: 'close-room' });
    expect((await viewer.next('room-closed')).reason).toBe('host-closed');
  });
});

describe('Perfil no protocolo 4', () => {
  const avatar = `data:image/jpeg;base64,${'A'.repeat(64)}`;

  it('envia o perfil novo a todos e ignora atualizações sem mudança', async () => {
    const { url } = await start();
    const owner = await modern(url, 4);
    const created = await modernRoom(owner);
    const friend = await modern(url, 4);
    await modernJoin(friend, created.code);
    await state(owner);

    friend.send({ type: 'update-profile', name: 'Amigo', avatar: '' });
    friend.send({ type: 'update-profile', name: 'Bia', avatar });
    const updated = await state(owner);
    const entry = updated.participants.find(
      (person) => person.peerId !== updated.selfId,
    ) as { name: string; avatar?: string };
    // The no-op update produced no snapshot, so the first one is already Bia.
    expect(entry).toMatchObject({ name: 'Bia', avatar });
  });

  it('limita alterações de perfil por conexão', async () => {
    const { url } = await start({
      rateLimits: { socketProfiles: { max: 2, windowMs: 60_000 } },
    });
    const owner = await modern(url, 4);
    await modernRoom(owner);
    for (const name of ['Um', 'Dois'])
      owner.send({ type: 'update-profile', name, avatar: '' });
    owner.send({ type: 'update-profile', name: 'Três', avatar: '' });
    expect(await owner.next('error')).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('recusa avatares que não são JPEG pequenos', async () => {
    const { url } = await start();
    const owner = await modern(url, 4);
    await modernRoom(owner);
    owner.send({
      type: 'update-profile',
      name: 'Dono',
      avatar: `data:image/png;base64,${'A'.repeat(64)}`,
    });
    expect(await owner.next('error')).toMatchObject({
      code: 'INVALID_MESSAGE',
    });
    owner.send({
      type: 'update-profile',
      name: 'Dono',
      avatar: `data:image/jpeg;base64,${'A'.repeat(9_001)}`,
    });
    expect(await owner.next('error')).toMatchObject({
      code: 'INVALID_MESSAGE',
    });
  });

  it('pede para atualizar o app ao entrar em sala de versão mais nova', async () => {
    const { url } = await start();
    const owner = await modern(url, 4);
    const created = await modernRoom(owner);
    const old = await modern(url, 3);
    old.send({ type: 'join-room', code: created.code, name: 'Antigo' });
    const failure = await old.next('error');
    expect(failure.code).toBe('PROTOCOL_MISMATCH');
    expect(failure.message).toContain('versão mais nova');
  });
});

describe('Endereço do cliente atrás de proxy', () => {
  const limited = { ipConnections: { max: 1, windowMs: 60_000 } };

  it('usa a última entrada de X-Forwarded-For quando o proxy é confiável', async () => {
    const { url } = await start({ trustProxyHops: 1, rateLimits: limited });
    await connect(url, undefined, { 'X-Forwarded-For': '1.1.1.1, 10.0.0.1' });
    await connect(url, undefined, { 'X-Forwarded-For': '1.1.1.1, 10.0.0.2' });
    await expect(
      connect(url, undefined, { 'X-Forwarded-For': '10.0.0.2' }),
    ).rejects.toThrow('429');
  });

  it('ignora X-Forwarded-For sem proxy configurado', async () => {
    const { url } = await start({ rateLimits: limited });
    await connect(url, undefined, { 'X-Forwarded-For': '10.0.0.1' });
    await expect(
      connect(url, undefined, { 'X-Forwarded-For': '10.0.0.2' }),
    ).rejects.toThrow('429');
  });
});

function gifAvatar(width = 64, height = 64) {
  const bytes = new Uint8Array(40);
  bytes.set([...'GIF89a'].map((char) => char.charCodeAt(0)));
  bytes.set([width & 255, width >> 8, height & 255, height >> 8], 6);
  return `data:image/gif;base64,${Buffer.from(bytes).toString('base64')}`;
}

describe('Avatares no protocolo 5', () => {
  it('envia só o identificador na sala e a imagem sob pedido', async () => {
    const { url } = await start();
    const owner = await modern(url, 5);
    const avatar = gifAvatar();
    owner.send({ type: 'create-room', name: 'Dono', avatar });
    const created = await state(owner, (value) => value.reason === 'created');
    expect(created.protocol).toBe(5);
    const self = created.participants[0] as {
      avatar?: string;
      avatarId?: string;
    };
    expect(self.avatar).toBeUndefined();
    expect(self.avatarId).toMatch(/^[a-f0-9]{16}$/);

    const friend = await modern(url, 5);
    await modernJoin(friend, created.code);
    friend.send({
      type: 'get-avatar',
      peerId: created.selfId,
      avatarId: self.avatarId!,
    });
    expect(await friend.next('participant-avatar')).toEqual({
      type: 'participant-avatar',
      peerId: created.selfId,
      avatarId: self.avatarId,
      avatar,
    });
  });

  it('ignora pedidos de foto com identificador errado ou de outra sala', async () => {
    const { url } = await start();
    const owner = await modern(url, 5);
    owner.send({ type: 'create-room', name: 'Dono', avatar: gifAvatar() });
    const created = await state(owner, (value) => value.reason === 'created');
    const outsider = await modern(url, 5);
    await modernRoom(outsider);
    outsider.send({
      type: 'get-avatar',
      peerId: created.selfId,
      avatarId: (created.participants[0] as { avatarId: string }).avatarId,
    });
    owner.send({
      type: 'get-avatar',
      peerId: created.selfId,
      avatarId: '0'.repeat(16),
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(
      [...outsider.inbox, ...owner.inbox].some(
        (message) => message.type === 'participant-avatar',
      ),
    ).toBe(false);
  });

  it('recusa GIFs grandes e imagens disfarçadas', async () => {
    const { url } = await start();
    const owner = await modern(url, 5);
    await modernRoom(owner);
    for (const avatar of [
      gifAvatar(300, 300),
      gifAvatar().replace('image/gif', 'image/webp'),
    ]) {
      owner.send({ type: 'update-profile', name: 'Dono', avatar });
      expect(await owner.next('error')).toMatchObject({
        code: 'INVALID_MESSAGE',
      });
    }
  });

  it('um app novo entra em sala antiga falando o protocolo dela', async () => {
    const { url } = await start();
    const old = await modern(url, 4);
    const created = await modernRoom(old);
    const fresh = await modern(url, 5);
    fresh.send({
      type: 'join-room',
      code: created.code,
      name: 'Nova',
      avatar: gifAvatar(),
    });
    const joined = await state(fresh, (value) => value.reason === 'joined');
    expect(joined.protocol).toBe(4);
    // The GIF cannot travel inside a protocol 4 snapshot.
    expect(
      joined.participants.find((person) => person.peerId === joined.selfId),
    ).not.toHaveProperty('avatar');
  });

  it('um app antigo não entra em sala nova', async () => {
    const { url } = await start();
    const fresh = await modern(url, 5);
    const created = await modernRoom(fresh);
    const old = await modern(url, 4);
    old.send({ type: 'join-room', code: created.code, name: 'Antigo' });
    expect((await old.next('error')).message).toContain('versão mais nova');
  });
});

describe('Grupos no protocolo 5', () => {
  const groupKey = 'c'.repeat(64);
  const wait = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  it('lista as salas do grupo só para quem tem a chave', async () => {
    const { url } = await start();
    const friend = await modern(url, 5);
    friend.send({ type: 'subscribe-group', groupKey, name: 'Bia' });
    expect(await friend.next('group-state')).toEqual({
      type: 'group-state',
      groupKey,
      rooms: [],
      online: ['Bia'],
    });
    const stranger = await modern(url, 5);
    stranger.send({
      type: 'subscribe-group',
      groupKey: 'd'.repeat(64),
      name: 'X',
    });
    await stranger.next('group-state');
    await wait(250);
    stranger.inbox.length = 0;
    friend.inbox.length = 0;

    const owner = await modern(url, 5);
    owner.send({ type: 'create-room', name: 'Ana', groupKey });
    const created = await state(owner, (value) => value.reason === 'created');
    const listing = await friend.next('group-state');
    expect(listing.rooms[0]).toMatchObject({
      code: created.code,
      ownerName: 'Ana',
      participants: 1,
      members: ['Ana'],
    });
    await wait(250);
    expect(
      stranger.inbox.some((message) => message.type === 'group-state'),
    ).toBe(false);

    owner.send({ type: 'close-room' });
    let closed = await friend.next('group-state');
    while (closed.rooms.length) closed = await friend.next('group-state');
    expect(closed.rooms).toEqual([]);
  });

  it('agrupa mudanças rápidas em uma só listagem', async () => {
    const { url } = await start();
    const friend = await modern(url, 5);
    friend.send({ type: 'subscribe-group', groupKey, name: 'Bia' });
    await friend.next('group-state');
    await wait(250);
    friend.inbox.length = 0;
    const owner = await modern(url, 5);
    owner.send({ type: 'create-room', name: 'Ana', groupKey });
    const created = await state(owner, (value) => value.reason === 'created');
    const guest = await modern(url, 5);
    await modernJoin(guest, created.code, 'Caio');
    await wait(400);
    const listings = friend.inbox.filter(
      (message) => message.type === 'group-state',
    );
    expect(listings.length).toBeGreaterThan(0);
    expect(listings.length).toBeLessThanOrEqual(2);
  });

  it('valida chaves, limita grupos e exige protocolo 5', async () => {
    const { url } = await start();
    const old = await modern(url, 4);
    old.send({ type: 'subscribe-group', groupKey, name: 'Bia' });
    expect(await old.next('error')).toMatchObject({
      code: 'PROTOCOL_MISMATCH',
    });
    old.send({ type: 'create-room', name: 'Ana', groupKey });
    expect(await old.next('error')).toMatchObject({
      code: 'PROTOCOL_MISMATCH',
    });

    const fresh = await modern(url, 5);
    fresh.send({ type: 'subscribe-group', groupKey: 'XYZ', name: 'Bia' });
    expect(await fresh.next('error')).toMatchObject({
      code: 'INVALID_MESSAGE',
    });
    for (let index = 0; index < 8; index++)
      fresh.send({
        type: 'subscribe-group',
        groupKey: index.toString(16).repeat(64),
        name: 'Bia',
      });
    fresh.send({
      type: 'subscribe-group',
      groupKey: 'e'.repeat(64),
      name: 'Bia',
    });
    expect(await fresh.next('error')).toMatchObject({ code: 'GROUP_LIMIT' });
  });

  it('remove a presença quando a conexão fecha', async () => {
    const { url } = await start();
    const first = await modern(url, 5);
    first.send({ type: 'subscribe-group', groupKey, name: 'Bia' });
    await first.next('group-state');
    const second = await modern(url, 5);
    second.send({ type: 'subscribe-group', groupKey, name: 'Caio' });
    await second.next('group-state');
    first.socket.terminate();
    let listing = await second.next('group-state');
    while (listing.online.includes('Bia'))
      listing = await second.next('group-state');
    expect(listing.online).toEqual(['Caio']);
  });

  it('conta como online quem está nas salas do grupo, e só do grupo', async () => {
    const { url } = await start();
    const friend = await modern(url, 5);
    friend.send({ type: 'subscribe-group', groupKey, name: 'Bia' });
    await friend.next('group-state');
    const owner = await modern(url, 5);
    owner.send({ type: 'create-room', name: 'Ana', groupKey });
    const created = await state(owner, (value) => value.reason === 'created');
    const guest = await modern(url, 5);
    await modernJoin(guest, created.code, 'Caio');
    const outsider = await modern(url, 5);
    outsider.send({ type: 'create-room', name: 'Fora' });
    await state(outsider, (value) => value.reason === 'created');

    let listing = await friend.next('group-state');
    while (!listing.online.includes('Caio'))
      listing = await friend.next('group-state');
    expect([...listing.online].sort()).toEqual(['Ana', 'Bia', 'Caio']);

    owner.send({ type: 'close-room' });
    while (listing.rooms.length) listing = await friend.next('group-state');
    expect(listing.online).toEqual(['Bia']);
  });
});

describe('Painel administrativo', () => {
  const statsToken = 's'.repeat(40);

  it('exige o token e não expõe segredos', async () => {
    const { url, httpUrl } = await start({ statsToken });
    const owner = await modern(url, 5);
    owner.send({ type: 'create-room', name: 'Ana', groupKey: 'f'.repeat(64) });
    const created = await state(owner, (value) => value.reason === 'created');

    expect((await fetch(`${httpUrl}/api/admin`)).status).toBe(401);
    const response = await fetch(`${httpUrl}/api/admin`, {
      headers: { Authorization: `Bearer ${statsToken}` },
    });
    expect(response.status).toBe(200);
    const text = await response.text();
    const data = JSON.parse(text);
    expect(data.rooms[0]).toMatchObject({
      name: 'Sala de Ana',
      protocol: 5,
      inGroup: true,
      participants: [{ name: 'Ana', role: 'owner', connected: true }],
    });
    expect(text).not.toContain(created.code);
    expect(text).not.toContain(created.resumeToken);
    expect(text).not.toContain('f'.repeat(64));
    expect(data.totals.roomsCreated).toBe(1);
  });

  it('serve a página com política de conteúdo estrita', async () => {
    const { httpUrl } = await start({ statsToken });
    const response = await fetch(`${httpUrl}/admin`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain(
      "default-src 'none'",
    );
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(await response.text()).not.toContain(statsToken);
  });

  it('não existe sem token configurado', async () => {
    const { httpUrl } = await start();
    expect((await fetch(`${httpUrl}/admin`)).status).toBe(404);
    expect((await fetch(`${httpUrl}/api/admin`)).status).toBe(404);
  });
});
