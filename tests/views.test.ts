import { describe, expect, it } from 'vitest';
import { DEFAULT_STREAM_PREFERENCES } from '../src/shared/quality';
import { renderHome } from '../src/renderer/views/home';
import { renderQualityPanel } from '../src/renderer/views/quality';
import { renderDiagnostics } from '../src/renderer/views/diagnostics';
import { renderSingleRoom } from '../src/renderer/views/single-room';
import { renderSidebar } from '../src/renderer/views/design';

describe('templates da interface', () => {
  it('mostra navegação para a sala apenas durante uma sessão ativa', () => {
    const home = renderSidebar('home', false, false, 'Ana', '0.9.0');
    const room = renderSidebar('room', true, false, 'Ana', '0.9.0');
    const collapsed = renderSidebar('home', false, true, 'Ana', '0.9.0');

    expect(home).not.toContain('data-action="room"');
    expect(room).toContain('data-action="room"');
    expect(room).toContain('>Sala</span>');
    expect(collapsed).toContain('class="profile-button"');
    expect(collapsed).toContain('aria-label="Alterar seu nome"');
    expect(collapsed).toContain('>A</span>');
  });

  it('escapa nomes e códigos inseridos na tela inicial', () => {
    const html = renderHome({
      enabled: true,
      busy: false,
      connecting: false,
      displayName: '<Luís>',
      editingName: true,
      joinCode: 'AB<&1234',
    });

    expect(html).toContain('value="&lt;Luís&gt;"');
    expect(html).toContain('value="AB&lt;&amp;1234"');
    expect(html).not.toContain('value="<Luís>"');
  });

  it('reflete o estado de conexão e desabilita os controles enquanto ocupado', () => {
    const html = renderHome({
      enabled: true,
      busy: true,
      connecting: true,
      displayName: 'Ana',
      editingName: false,
      joinCode: '',
    });

    expect(html).toContain('Conectando…');
    expect(html.match(/disabled/g)).toHaveLength(3);
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

    expect(html).toContain('1080p · 120 FPS');
    expect(html).toContain('value="1080p120" selected');
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
