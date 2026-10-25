import { describe, expect, it } from 'vitest';
import { DEFAULT_STREAM_PREFERENCES } from '../src/shared/quality';
import { renderQualityPanel } from '../src/renderer/views/quality';
import { renderDiagnostics } from '../src/renderer/views/diagnostics';
import { renderSingleRoom } from '../src/renderer/views/single-room';
import { renderSidebar, type RailGroup } from '../src/renderer/views/design';
import { renderAppShell } from '../src/renderer/views/app-shell';

const rail = (
  overrides: Partial<Parameters<typeof renderSidebar>[0]> = {},
): string =>
  renderSidebar({
    page: 'home',
    hasRoom: false,
    groups: [],
    canAddGroup: true,
    displayName: 'Ana',
    profilePhoto: '',
    version: '0.10.0',
    profileMenuOpen: false,
    ...overrides,
  });

describe('templates da interface', () => {
  it('mostra o atalho da sala apenas durante uma sessão ativa', () => {
    expect(rail()).not.toContain('data-action="room"');
    const room = rail({ page: 'room', hasRoom: true });
    expect(room).toContain('data-action="room"');
    expect(room).toContain('aria-label="Voltar para a sala"');
    expect(room).toContain('aria-current="page"');
  });

  it('lista os grupos na lateral e marca o grupo aberto', () => {
    const groups: RailGroup[] = [
      {
        secret: 'a',
        name: '<Turma>',
        initials: 'TU',
        selected: true,
        live: true,
      },
      {
        secret: 'b',
        name: 'Família',
        initials: 'FA',
        selected: false,
        live: false,
      },
    ];
    const html = rail({ groups });
    expect(html).toContain('class="rail-logo"');
    expect(html).toContain('title="&lt;Turma&gt;"');
    expect(html).toContain('aria-label="&lt;Turma&gt;, com tela ao vivo"');
    expect(html).not.toContain('<Turma>');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('data-action="add-group"');
    expect(rail({ groups, page: 'settings' })).not.toContain(
      'aria-current="page"',
    );
    expect(rail({ canAddGroup: false })).not.toContain(
      'data-action="add-group"',
    );
  });

  it('abre perfil e configurações pelo menu da foto', () => {
    const closed = rail();
    expect(closed).toContain('data-action="toggle-profile-menu"');
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).toContain('aria-label="Perfil de Ana"');
    expect(closed).not.toContain('data-action="settings"');
    const open = rail({ profileMenuOpen: true, displayName: '<Luís>' });
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain('data-action="edit-name"');
    expect(open).toContain('data-action="settings"');
    expect(open).toContain('&lt;Luís&gt;');
    expect(open).toContain('v0.10.0');
    expect(open).not.toContain('<Luís>');
  });

  it('mostra o título só em Configurações', () => {
    const shell = (page: 'home' | 'settings') =>
      renderAppShell({
        page,
        hasDesktopApi: true,
        notice: null,
        sidebar: '<aside class="rail"></aside>',
        home: '<p>início</p>',
        settings: () => '<p>configurações</p>',
        room: '',
        modal: '',
      });
    expect(shell('home')).not.toContain('class="page-heading"');
    expect(shell('settings')).toContain('<h1>Configurações</h1>');
    expect(shell('home')).toContain('class="app-shell has-rail"');
  });

  it('mostra os perfis disponíveis e escapa a mensagem de estado', () => {
    const html = renderQualityPanel({
      preferences: { ...DEFAULT_STREAM_PREFERENCES, preset: '1080p120' },
      pendingPreferences: null,
      disabled: false,
      applying: false,
      sharing: false,
      status: '<falha>',
    });

    expect(html).toContain('value="1080p30" selected');
    expect(html).toContain('value="120" selected>120 QPS</option>');
    expect(html).toContain('&lt;falha&gt;');
    expect(html).not.toContain(
      '<p class="quality-status" role="status"><falha>',
    );
  });

  it('renderiza diagnóstico de anfitrião vazio e escapa nomes de espectadores', () => {
    const empty = renderDiagnostics({
      room: { role: 'host', hostName: 'Ana' },
      multi: null,
      viewers: [],
    });
    const withViewer = renderDiagnostics({
      room: { role: 'host', hostName: 'Ana' },
      multi: null,
      viewers: [{ id: 'peer-1', name: '<Bia>' }],
    });

    expect(empty).toContain('As medições de cada amigo aparecem');
    expect(withViewer).toContain('&lt;Bia&gt;');
    expect(withViewer).not.toContain('<strong><Bia></strong>');
  });

  it('mostra diagnóstico de recepção para uma sala antiga', () => {
    const html = renderDiagnostics({
      room: { role: 'viewer', hostId: 'host-1', hostName: '<Dono>' },
      multi: null,
      viewers: [],
    });

    expect(html).toContain('Vídeo recebido');
    expect(html).toContain('&lt;Dono&gt;');
    expect(html).toContain('data-peer-metrics="host-1"');
  });

  it('renderiza sala antiga do anfitrião e mantém o controle de captura', () => {
    const html = renderSingleRoom({
      room: {
        role: 'host',
        code: 'ABCD1234',
        selfId: 'host-1',
        hostName: 'Ana',
        maxViewers: 9,
      },
      roomState: null,
      sharedSourceName: 'Janela privada',
      sharing: false,
      remoteSharing: false,
      hasLocalVideo: false,
      hasRemoteVideo: false,
      connectionIssue: '',
      busy: false,
      displayName: 'Ana',
      viewers: [],
    });

    expect(html).toContain('data-action="choose-source"');
    expect(html).toContain('data-action="leave"');
    expect(html).not.toContain('data-action="rooms"');
    expect(html).toContain('ABCD');
    expect(html).toContain('Até 9 amigos podem assistir.');
  });

  it('renderiza moderador e escapa nomes na sala de protocolo 2', () => {
    const html = renderSingleRoom({
      room: {
        role: 'viewer',
        code: 'ABCD1234',
        selfId: 'moderator-1',
        hostId: 'owner-1',
        hostName: '<Anfitrião>',
        maxViewers: 9,
      },
      roomState: {
        type: 'room-state',
        protocol: 2,
        reason: 'joined',
        code: 'ABCD1234',
        name: 'Grupo',
        selfId: 'moderator-1',
        ownerId: 'owner-1',
        publisherId: 'owner-1',
        maxParticipants: 10,
        participants: [
          {
            peerId: 'owner-1',
            name: '<Anfitrião>',
            role: 'owner',
            connected: true,
          },
          {
            peerId: 'moderator-1',
            name: 'Mod',
            role: 'moderator',
            connected: true,
          },
          {
            peerId: 'peer-3',
            name: 'Pessoa',
            role: 'participant',
            connected: true,
          },
        ],
        sharing: false,
        resumeToken: 'resume-token',
      },
      sharedSourceName: '',
      sharing: false,
      remoteSharing: false,
      hasLocalVideo: false,
      hasRemoteVideo: false,
      connectionIssue: '',
      busy: false,
      displayName: 'Mod',
      viewers: [],
    });

    expect(html).toContain('SALA POR CONVITE');
    expect(html).toContain('&lt;Anfitrião&gt;');
    expect(html).toContain('data-action="set-publisher"');
    expect(html).toContain('data-action="kick"');
  });
});
