import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import {
  createSignalingServer,
  type SignalingOptions,
} from '../src/server/server.js';
import type { ClientMessage, ServerMessage } from '../src/shared/protocol.js';

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

async function connect(url: string, origin = 'app://discorja') {
  const socket = new WebSocket(url, { origin });
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

async function modern(url: string) {
  const peer = await connect(url);
  peer.send({ type: 'hello', protocol: 2 });
  expect(await peer.next('hello')).toEqual({ type: 'hello', protocol: 2 });
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

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await Promise.all(services.splice(0).map((service) => service.close()));
});

describe('sinalização Discorja', () => {
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
  it('conecta anfitrião e dois espectadores, normaliza código e encaminha SDP/ICE', async () => {
    const { url, httpUrl } = await start();
    const [host, one, two] = await Promise.all([
      connect(url),
      connect(url),
      connect(url),
    ]);
    const room = await createRoom(host);
    expect(room.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/u);
    expect(room.maxViewers).toBe(4);
    const first = await join(
      one,
      `${room.code.slice(0, 4)}- ${room.code.slice(4)}`.toLowerCase(),
      'Ana',
    );
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
    const oversized = new Promise<number>((resolve) =>
      peer.socket.once('close', resolve),
    );
    peer.socket.send('a'.repeat(65_537));
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
    const { url, wss } = await start({ heartbeatIntervalMs: 30 });
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
  });
});
