import { describe, expect, it } from 'vitest';
import { DEFAULT_STREAM_PREFERENCES } from '../src/shared/quality';
import { renderQualityPanel } from '../src/renderer/views/quality';
import { renderDiagnostics } from '../src/renderer/views/diagnostics';
import { renderSingleRoom } from '../src/renderer/views/single-room';
import { renderSidebar, type RailGroup } from '../src/renderer/views/design';
import { renderAppShell } from '../src/renderer/views/app-shell';
import { renderSettingsView } from '../src/renderer/views/settings-view';
import { renderProfileSettings } from '../src/renderer/views/profile-settings';

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

  it('mostra Configurações sem a lateral de grupos', () => {
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
    expect(shell('home')).toContain('class="app-shell has-rail"');
    expect(shell('home')).toContain('<aside class="rail">');
    expect(shell('settings')).toContain('class="app-shell no-rail"');
    expect(shell('settings')).not.toContain('<aside class="rail">');
  });

  it('organiza Configurações em seções e destaca o caminho de volta', () => {
    const view = (
      overrides: Partial<Parameters<typeof renderSettingsView>[0]> = {},
    ) =>
      renderSettingsView({
        section: 'transmissao',
        config: {
          signalingUrl: 'wss://servidor.exemplo',
          iceServers: [],
          version: '0.12.0',
          updatesConfigured: true,
          systemAudioSupported: true,
        },
        update: { status: 'idle' },
        serverUrl: 'wss://servidor.exemplo',
        connected: false,
        saving: false,
        testing: false,
        connectionStatus: 'Não testado',
        backTo: 'home',
        dirty: false,
        qualityControls: '<p>qualidade</p>',
        profileControls: '<p>perfil</p>',
        ...overrides,
      });
    const html = view();
    expect(html).toContain('data-action="close-settings"');
    expect(html).toContain('Voltar ao Início');
    expect(view({ backTo: 'room' })).toContain('Voltar à sala');
    for (const section of [
      'perfil',
      'transmissao',
      'conexao',
      'atualizacoes',
      'diagnostico',
    ])
      expect(html).toContain(`data-section="${section}"`);
    expect(html).toContain('data-section="transmissao" aria-current="page"');
    expect(html).toContain('<p>qualidade</p>');
    expect(html).not.toContain('<p>perfil</p>');
    expect(view({ section: 'perfil' })).toContain('<p>perfil</p>');
    expect(html).toMatch(/class="settings-savebar"[^>]*hidden/);
    expect(view({ dirty: true })).not.toMatch(
      /class="settings-savebar"[^>]*hidden/,
    );
    const server = view({ section: 'conexao', serverUrl: '"><x>' });
    expect(server).toContain('&quot;&gt;&lt;x&gt;');
    expect(view({ section: 'conexao', connected: true })).toContain(
      'Saia da sala para alterar o servidor.',
    );
    const updates = view({
      section: 'atualizacoes',
      update: { status: 'available', version: '0.13.0' },
    });
    expect(updates).toContain('data-action="download-update"');
    expect(updates).toContain('aria-label="Atualização disponível"');
    expect(view({ section: 'diagnostico' })).toContain(
      'data-action="export-logs"',
    );
  });

  it('edita o perfil em Configurações e escapa nome e foto', () => {
    const html = renderProfileSettings({
      name: '<Luís>',
      photo: 'data:image/png;base64,"x',
    });
    expect(html).toContain('id="profile-photo-preview"');
    expect(html).toContain('data-action="profile-choose-photo"');
    expect(html).toContain('Escolher mídia');
    expect(html).toContain(
      'data-action="profile-capture" disabled hidden>Tirar foto',
    );
    expect(html).toContain('data-action="profile-remove-photo"');
    expect(html).toContain('value="&lt;Luís&gt;"');
    expect(html).not.toContain('<Luís>');
    expect(html).toContain('&quot;x');
    const empty = renderProfileSettings({ name: '', photo: '' });
    expect(empty).not.toContain('data-action="profile-remove-photo"');
    expect(empty).toContain('Seu nome');
  });

  it('mostra QPS e resolução como escolhas e escapa a mensagem de estado', () => {
    const html = renderQualityPanel({
      preferences: { ...DEFAULT_STREAM_PREFERENCES, preset: '1080p120' },
      pendingPreferences: null,
      disabled: false,
      applying: false,
      sharing: false,
      status: '<falha>',
    });

    expect(html).toContain(
      'id="settings-quality-preset-1080p30" name="settings-quality-preset" value="1080p30" checked',
    );
    for (const fps of [30, 60, 75, 90, 120])
      expect(html).toContain(`id="settings-fps-${fps}"`);
    expect(html).not.toContain('id="settings-fps-45"');
    expect(html).toContain('value="120" checked');
    expect(html).toContain('role="switch"');
    expect(html).toContain('&lt;falha&gt;');
    expect(html).not.toContain('<falha>');
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
