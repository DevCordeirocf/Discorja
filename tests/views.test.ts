import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STREAM_PREFERENCES } from '../src/shared/quality';
import { QualityPanel } from '../src/renderer/views/quality';
import {
  DiagnosticsPanel,
  type DiagnosticsViewProps,
} from '../src/renderer/views/diagnostics';
import {
  SingleRoom,
  type SingleRoomViewProps,
} from '../src/renderer/views/single-room';
import { Stage, type StageViewProps } from '../src/renderer/views/stage';
import {
  Sidebar,
  type RailGroup,
  type SidebarProps,
} from '../src/renderer/views/sidebar';
import { AppShell, type AppShellProps } from '../src/renderer/views/app-shell';
import {
  SettingsView,
  type SettingsViewProps,
} from '../src/renderer/views/settings-view';
import { ProfileSettings } from '../src/renderer/views/profile-settings';
import { ModalView, type ModalViewProps } from '../src/renderer/views/modals';

const renderDiagnostics = (view: DiagnosticsViewProps) =>
  renderToStaticMarkup(createElement(DiagnosticsPanel, view));
const audio = {
  sendAudio: { sharing: false, localStream: null },
  receiveAudio: {
    remoteStream: null,
    multiRoom: false,
    localStream: null,
    receiveMuted: false,
    receiveVolume: 1,
    filteredAudioAvailable: false,
  },
};
const renderSingleRoom = (
  view: Omit<
    SingleRoomViewProps,
    | 'stream'
    | 'idleSourceLabel'
    | 'reconnectingVideo'
    | 'sendAudio'
    | 'receiveAudio'
  >,
) =>
  renderToStaticMarkup(
    createElement(SingleRoom, {
      ...view,
      ...audio,
      stream: null,
      idleSourceLabel: 'Perfil 1280 × 720 · 30 QPS · sem áudio',
      reconnectingVideo: false,
    }),
  );

const rail = (overrides: Partial<SidebarProps> = {}): string =>
  renderToStaticMarkup(
    createElement(Sidebar, {
      page: 'home',
      hasRoom: false,
      groups: [],
      canAddGroup: true,
      displayName: 'Ana',
      profilePhoto: '',
      version: '0.10.0',
      profileMenuOpen: false,
      ...overrides,
    }),
  );

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
    expect(html).toContain('alt="Discorja"');
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
    const shell = (
      page: 'home' | 'settings',
      overrides: Partial<AppShellProps> = {},
    ) =>
      renderToStaticMarkup(
        createElement(AppShell, {
          page,
          hasDesktopApi: true,
          notice: null,
          sidebar: createElement('aside', { className: 'rail' }),
          home: '<p>início</p>',
          settings: createElement('p', null, 'configurações'),
          room: '',
          modal: '',
          ...overrides,
        }),
      );
    expect(shell('home')).toContain('class="app-shell has-rail"');
    expect(shell('home')).toContain('<aside class="rail">');
    expect(shell('settings')).toContain('class="app-shell no-rail"');
    expect(shell('settings')).not.toContain('<aside class="rail">');
    expect(shell('settings')).toContain('<p>configurações</p>');
    expect(shell('home')).not.toContain('<p>configurações</p>');
    const notice = shell('home', {
      notice: { text: '<falha>', kind: 'error' },
    });
    expect(notice).toContain('role="alert"');
    expect(notice).toContain('&lt;falha&gt;');
    expect(notice).not.toContain('<falha>');
  });

  it('organiza Configurações em seções e destaca o caminho de volta', () => {
    const view = (overrides: Partial<SettingsViewProps> = {}) =>
      renderToStaticMarkup(
        createElement(SettingsView, {
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
          photoProcessing: false,
          qualityPanel: createElement('p', null, 'qualidade'),
          profilePanel: createElement('p', null, 'perfil'),
          ...overrides,
        }),
      );
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
    expect(html).toMatch(/aria-label="Alterações não salvas"[^>]*hidden/);
    expect(view({ dirty: true })).not.toMatch(
      /aria-label="Alterações não salvas"[^>]*hidden/,
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
    const camera = {
      active: false,
      starting: false,
      processing: false,
      status: '',
    };
    const renderProfileSettings = (draft: { name: string; photo: string }) =>
      renderToStaticMarkup(createElement(ProfileSettings, { draft, camera }));
    const html = renderProfileSettings({
      name: '<Luís>',
      photo: 'data:image/png;base64,"x',
    });
    expect(html).toContain('id="profile-photo-preview"');
    expect(html).toContain('data-action="profile-choose-photo"');
    expect(html).toContain('Escolher mídia');
    expect(html).toContain(
      'data-action="profile-capture" disabled="" hidden="">Tirar foto',
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
    const html = renderToStaticMarkup(
      createElement(QualityPanel, {
        preferences: { ...DEFAULT_STREAM_PREFERENCES, preset: '1080p120' },
        pendingPreferences: null,
        disabled: false,
        applying: false,
        sharing: false,
        status: '<falha>',
      }),
    );

    expect(html).toContain(
      'id="settings-quality-preset-1080p30" name="settings-quality-preset" checked="" value="1080p30"',
    );
    for (const fps of [30, 60, 75, 90, 120])
      expect(html).toContain(`id="settings-fps-${fps}"`);
    expect(html).not.toContain('id="settings-fps-45"');
    expect(html).toContain('checked="" value="120"');
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
    // Measured values are left empty for `patchMetrics` to fill in.
    expect(withViewer).toContain('data-value="fps"></dd>');
    expect(withViewer).toContain('data-stat="capture"></strong>');
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
      connectionIssue: '',
      busy: false,
      displayName: 'Ana',
      viewers: [],
    });

    expect(html).toContain('data-action="choose-source"');
    expect(html).toContain('Perfil 1280 × 720 · 30 QPS · sem áudio');
    expect(html).toContain('data-action="show-diagnostics"');
    expect(html).not.toContain('id="stream-video"');
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

  it('lista telas ao vivo no palco e escapa nomes', () => {
    const view = (overrides: Partial<StageViewProps> = {}) =>
      renderToStaticMarkup(
        createElement(Stage, {
          state: {
            type: 'room-state',
            reason: 'updated',
            protocol: 4,
            code: 'ABCDEFGH',
            name: '<Sala>',
            selfId: 'p1',
            ownerId: 'p1',
            publisherId: '',
            maxParticipants: 10,
            participants: [
              { peerId: 'p1', name: 'Ana', role: 'owner', connected: true },
              {
                peerId: 'p2',
                name: '<Bia>',
                role: 'participant',
                connected: true,
              },
              {
                peerId: 'p3',
                name: 'Caio',
                role: 'participant',
                connected: false,
              },
            ],
            sharing: false,
            resumeToken: 'x',
            publications: [
              {
                publicationId: 'pub2',
                publisherId: 'p2',
                audio: false,
                connected: true,
                watchers: 0,
              },
            ],
            maxPublishers: 1,
            watching: null,
            watchRequestId: null,
            subscribers: [],
          },
          watching: null,
          sharing: false,
          stream: null,
          hasRemote: false,
          hasLocal: false,
          busy: false,
          issue: '',
          recovering: false,
          reconnectingVideo: false,
          ...audio,
          ...overrides,
        }),
      );
    const html = view();
    expect(html).toContain('&lt;Sala&gt;');
    expect(html).toContain('Assistir transmissão de &lt;Bia&gt;');
    expect(html).not.toContain('<Bia>');
    expect(html).toContain('live-stream-person');
    expect(html).toContain('Ampliar foto de Caio');
    expect(html).toContain('Reconectando…');
    // One screen at a time in this room, so sharing waits for a free slot.
    expect(html).toMatch(/data-action="choose-source" disabled=""/u);
    const issue = view({ watching: 'pub2', issue: '<falha>' });
    expect(issue).toContain('role="alert"');
    expect(issue).toContain('&lt;falha&gt;');
    expect(issue).toContain('data-action="retry-watching"');
  });

  describe('diálogos', () => {
    const modal = (overrides: Partial<ModalViewProps> = {}) =>
      renderToStaticMarkup(
        createElement(ModalView, {
          modal: null,
          isRoomOwner: false,
          update: { status: 'idle' },
          version: '0.12.0',
          hasRoom: false,
          diagnostics: createElement(
            'div',
            { className: 'stream-diagnostics' },
            'métricas',
          ),
          sources: [
            { id: 'screen:1', name: 'Tela "1"', kind: 'screen', thumbnail: '' },
            { id: 'window:2', name: '<Jogo>', kind: 'window', thumbnail: '' },
          ],
          selectedSource: 'screen:1',
          busy: null,
          sourcePage: 'screen',
          captureAudio: { include: false, exclude: false, supported: true },
          whatsNew: [],
          ...overrides,
        }),
      );

    it('não renderiza nada sem diálogo aberto', () => {
      expect(modal()).toBe('');
    });

    it('lista as fontes da aba atual e marca a escolhida', () => {
      const html = modal({ modal: 'sources' });
      expect(html).toContain('class="modal-overlay');
      expect(html).toContain('role="dialog"');
      expect(html).toMatch(/class="source-option [^"]*selected/u);
      expect(html).toContain('aria-pressed="true"');
      expect(html).toContain('Tela &quot;1&quot;');
      expect(html).not.toContain('Jogo');
      expect(html).toContain('id="include-system-audio"');
      expect(html).not.toContain('id="exclude-discord-audio"');
      const windows = modal({ modal: 'sources', sourcePage: 'window' });
      expect(windows).toContain('&lt;Jogo&gt;');
      expect(windows).not.toContain('<Jogo>');
      expect(windows).toContain('aria-labelledby="source-tab-guides"');
    });

    it('mostra as opções de áudio e bloqueia durante a captura', () => {
      const audio = modal({
        modal: 'sources',
        captureAudio: { include: true, exclude: false, supported: true },
      });
      expect(audio).toMatch(/id="include-system-audio"[^>]*checked=""/u);
      expect(audio).toContain('id="exclude-discord-audio"');
      expect(audio).toContain('O áudio inclui o Discord');
      const busy = modal({ modal: 'sources', busy: 'capture' });
      expect(busy).toContain('Iniciando…');
      expect(busy).toMatch(/data-action="start-share" disabled=""/u);
      const loading = modal({ modal: 'sources', busy: 'sources' });
      expect(loading).toContain('Carregando…');
      expect(loading).not.toContain('source-groups');
      const unsupported = modal({
        modal: 'sources',
        captureAudio: { include: false, exclude: false, supported: false },
      });
      expect(unsupported).toContain('Disponível no Windows.');
    });

    it('confirma troca de sala, atualização e mostra o diagnóstico', () => {
      expect(modal({ modal: 'switch' })).not.toContain('dono');
      expect(modal({ modal: 'switch', isRoomOwner: true })).toContain(
        'Como você é o dono',
      );
      const update = modal({
        modal: 'update',
        hasRoom: true,
        update: { status: 'downloaded', version: '<1.0>' },
      });
      expect(update).toContain('Atualização pronta');
      expect(update).toContain('Nova versão: &lt;1.0&gt;');
      expect(update).toContain('data-action="confirm-install-update"');
      expect(update).toContain('Reiniciar encerrará sua participação');
      const diagnostics = modal({ modal: 'diagnostics' });
      expect(diagnostics).toContain('diagnostics-overlay');
      expect(diagnostics).toContain('Diagnóstico da conexão');
      expect(diagnostics).toContain(
        '<div class="stream-diagnostics">métricas</div>',
      );
      expect(
        modal({ modal: 'add-group', renderFeatureModal: () => 'grupo' }),
      ).toBe('grupo');
    });
  });
});
