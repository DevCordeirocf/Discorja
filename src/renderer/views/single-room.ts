import type { LegacyRoomState } from '../../shared/protocol';
import { escapeHtml as escape } from '../ui/components/html';
import { icon } from '../ui/components/icons';

export interface SingleRoomView {
  room: {
    role: 'host' | 'viewer';
    code: string;
    selfId: string;
    hostId?: string;
    hostName: string;
    maxViewers: number;
  };
  roomState: LegacyRoomState | null;
  sharedSourceName: string;
  sharing: boolean;
  remoteSharing: boolean;
  hasLocalVideo: boolean;
  hasRemoteVideo: boolean;
  connectionIssue: string;
  busy: boolean;
  displayName: string;
  viewers: Array<{
    id: string;
    name: string;
    connected: boolean;
    failed: boolean;
    reconnecting: boolean;
  }>;
}

function renderConnectionIssue(issue: string): string {
  const developerName = 'DevCordeiroCf';
  const index = issue.indexOf(developerName);
  if (index < 0) return escape(issue);
  return `${escape(issue.slice(0, index))}<a href="https://github.com/${developerName}" target="_blank" rel="noopener noreferrer">${developerName}</a>${escape(issue.slice(index + developerName.length))}`;
}

export function renderSingleRoom(view: SingleRoomView): string {
  const { room } = view;
  if (view.roomState) {
    const state = view.roomState;
    const publisher = room.role === 'host';
    const owner = state.ownerId === room.selfId;
    const self = state.participants.find(
      (member) => member.peerId === room.selfId,
    )!;
    const moderate = owner || self.role === 'moderator';
    const stream = publisher ? view.hasLocalVideo : view.hasRemoteVideo;
    const isLive = publisher ? view.sharing : view.remoteSharing;
    const people = state.participants
      .map((member) => {
        const canRemove =
          moderate &&
          member.peerId !== room.selfId &&
          member.role !== 'owner' &&
          (owner || member.role !== 'moderator');
        return `<div class="person"><span class="avatar">${escape(member.name.charAt(0).toUpperCase())}</span><div><strong>${escape(member.name)}${member.peerId === room.selfId ? ' <span>(você)</span>' : ''}</strong><small>${member.role === 'owner' ? 'Dono da sala' : member.role === 'moderator' ? 'Moderador' : 'Participante'}${member.peerId === state.publisherId ? ' · Pode transmitir' : ''}${!member.connected ? ' · Reconectando' : ''}</small></div><div class="participant-actions">${moderate && member.connected && member.peerId !== state.publisherId ? `<button class="button subtle" data-action="set-publisher" data-peer="${escape(member.peerId)}" aria-label="Permitir transmissão de ${escape(member.name)}">Permitir tela</button>` : ''}${owner && member.role !== 'owner' ? `<button class="button subtle" data-action="set-moderator" data-peer="${escape(member.peerId)}" data-enabled="${member.role !== 'moderator'}" aria-label="${member.role === 'moderator' ? 'Retirar moderação de' : 'Tornar moderador'} ${escape(member.name)}">${member.role === 'moderator' ? 'Retirar moderação' : 'Moderar'}</button>` : ''}${canRemove ? `<button class="icon-button remove-button" data-action="kick" data-peer="${escape(member.peerId)}" aria-label="Remover ${escape(member.name)} da sala">${icon('close')}</button>` : ''}</div></div>`;
      })
      .join('');
    return `<section class="room-header"><div><span class="eyebrow">${owner ? 'SUA SALA' : 'SALA POR CONVITE'}</span><h1>${escape(state.name)}</h1><p>${publisher ? 'Você pode escolher uma tela para compartilhar.' : `${escape(room.hostName)} pode iniciar a transmissão.`}</p></div><div class="audio-actions"><button class="button subtle danger-text" data-action="leave">${icon('exit')}${owner ? 'Encerrar sala' : 'Sair da sala'}</button></div></section>
  <div class="room-grid"><section class="broadcast-panel" aria-label="${publisher ? 'Compartilhamento de tela' : 'Transmissão'}"><div class="broadcast-heading"><div class="host-label"><span class="avatar">${escape(room.hostName.charAt(0).toUpperCase())}</span><div><strong>${publisher ? 'Sua transmissão' : escape(room.hostName)}</strong><small>${publisher ? 'Permissão para transmitir' : 'Transmissor da sala'}</small></div></div><span class="status-pill ${isLive ? 'live' : ''}"><i></i>${isLive ? 'AO VIVO' : 'EM ESPERA'}</span></div><div class="video-stage ${stream ? 'has-video' : ''}">${stream ? '<video id="stream-video" autoplay playsinline muted aria-label="Vídeo da tela compartilhada"></video>' : `<div class="empty-stream"><div class="empty-screen-icon">${icon('screen')}</div><h2>${publisher ? 'Tudo pronto para compartilhar.' : 'Aguardando a transmissão.'}</h2><p>${publisher ? 'A captura só começa quando você escolhe e inicia.' : 'Uma pessoa transmite por vez nesta versão.'}</p>${publisher ? `<button class="button primary" data-action="choose-source" ${view.busy ? 'disabled' : ''}>${icon('screen')} Escolher o que compartilhar</button>` : ''}</div>`}</div><div class="broadcast-controls"><span>${icon('screen')}<span>${escape(publisher && view.sharing ? view.sharedSourceName : 'Tela compartilhada')}</span></span>${publisher && view.sharing ? `<button class="button stop-button" data-action="stop">${icon('stop')} Parar de compartilhar</button>` : !publisher && stream ? `<button class="button subtle" data-action="fullscreen">${icon('expand')} Tela cheia</button>` : ''}</div></section>
  <aside class="room-sidebar"><section class="invite-card"><div class="mini-heading">${icon('lock')} SALA POR CONVITE</div><h2>Chame sua turma.</h2><div class="room-code" aria-label="Código da sala">${escape(room.code.slice(0, 4))}<span></span>${escape(room.code.slice(4))}</div><button class="button secondary wide" data-action="copy">${icon('copy')} Copiar código</button><small>Todos devem usar o mesmo servidor e uma versão compatível.</small></section><section class="people-card"><div class="section-heading"><h2>Na sala</h2><span>${state.participants.length}/${state.maxParticipants}</span></div>${people}</section><div class="room-note">${icon('shield')}<p>O dono administra a sala. Autorizar uma tela não inicia a captura. Ao sair, o dono encerra esta sala.</p></div></aside></div>
  ${view.connectionIssue ? `<div class="connection-alert" role="alert"><p>${escape(view.connectionIssue)}</p><button class="button subtle" data-action="rejoin">Entrar novamente</button></div>` : ''}${publisher && view.sharing ? '<div class="sharing-reminder">Sua tela está sendo transmitida.</div>' : ''}`;
  }

  const host = room.role === 'host';
  const hasVideo = host ? view.hasLocalVideo : view.hasRemoteVideo;
  const isLive = host ? view.sharing : view.remoteSharing;
  const initial = room.hostName.charAt(0).toLocaleUpperCase('pt-BR') || '?';
  return `<section class="room-header"><div><span class="eyebrow">${host ? 'SUA SALA, SEU MOMENTO' : 'BOM TER VOCÊ POR AQUI'}</span><h1>${host ? 'A turma tem um lugar.' : `Sala de ${escape(room.hostName)}`}</h1><p>${host ? 'Convide seus amigos. O resto acontece junto.' : 'Sente, acompanhe e aproveite a companhia.'}</p></div><button class="button subtle danger-text" data-action="leave">${icon('exit')}${host ? 'Encerrar sala' : 'Sair da sala'}</button></section>
  <div class="room-grid"><section class="broadcast-panel" aria-label="${host ? 'Compartilhamento de tela' : 'Transmissão'}"><div class="broadcast-heading"><div class="host-label"><span class="avatar">${escape(initial)}</span><div><strong>${host ? 'Sua transmissão' : escape(room.hostName)}</strong><small>${host ? 'Você é o anfitrião' : 'Anfitrião da sala'}</small></div></div><span class="status-pill ${isLive ? 'live' : ''}"><i></i>${isLive ? (host ? 'TRANSMITINDO' : hasVideo ? 'AO VIVO' : 'CONECTANDO') : 'EM ESPERA'}</span></div>
  <div class="video-stage ${hasVideo ? 'has-video' : ''}">${hasVideo ? '<video id="stream-video" autoplay playsinline muted aria-label="Vídeo da tela compartilhada"></video>' : `<div class="empty-stream"><div class="empty-screen-icon">${icon(view.connectionIssue ? 'network' : 'screen')}<span>${icon(host ? 'plus' : 'users')}</span></div><h2>${host ? 'Tudo pronto para compartilhar.' : view.connectionIssue ? 'Vamos tentar de novo?' : view.remoteSharing ? 'Preparando a conexão…' : 'O encontro já começou.'}</h2><p>${host ? 'Escolha uma janela ou uma tela.<br>Seus amigos verão apenas o que você selecionar.' : view.connectionIssue ? 'A conexão entre os computadores precisa de atenção.' : view.remoteSharing ? 'Conectando você à tela do anfitrião.' : `${escape(room.hostName)} ainda não está transmitindo.<br>Assim que começar, a tela aparece aqui.`}</p>${host ? `<button class="button primary" data-action="choose-source" ${view.busy ? 'disabled' : ''}>${icon('screen')} Escolher o que compartilhar</button>` : `<span class="waiting-label">${view.connectionIssue ? icon('alert') : '<span class="pulse-dot"></span>'}${view.connectionIssue ? 'Conexão interrompida' : view.remoteSharing ? 'Estabelecendo conexão direta' : 'Aguardando o anfitrião'}</span>`}</div>`}</div>
  <div class="broadcast-controls"><span>${icon('screen')}<span>${hasVideo ? escape(host ? view.sharedSourceName : 'Tela compartilhada') : 'Vídeo compartilhado · sem áudio'}</span></span>${host && view.sharing ? `<button class="button stop-button" data-action="stop">${icon('stop')} Parar de compartilhar</button>` : !host && hasVideo ? `<button class="button subtle" data-action="fullscreen">${icon('expand')} Tela cheia</button>` : `<span class="quiet-label">${host ? 'A captura só começa com você.' : 'A sala continua aberta.'}</span>`}</div></section>
  <aside class="room-sidebar"><section class="invite-card"><div class="mini-heading">${icon('lock')} SALA PRIVADA</div><h2>${host ? 'Chame quem importa.' : 'Você está na sala.'}</h2><p>${host ? 'Envie o código para seus amigos.' : 'Este é o código do seu encontro.'}</p><div class="room-code" aria-label="Código da sala">${escape(room.code.slice(0, 4))}<span></span>${escape(room.code.slice(4))}</div><button class="button secondary wide" data-action="copy">${icon('copy')} Copiar código</button><small>Todos devem usar o mesmo servidor.</small></section>
  <section class="people-card"><div class="section-heading"><h2>Na sala</h2><span>${host ? `${view.viewers.length + 1}/${room.maxViewers + 1}` : 'Você + anfitrião'}</span></div><div class="person"><span class="avatar">${escape(initial)}</span><div><strong>${escape(room.hostName)}${host ? ' <span>(você)</span>' : ''}</strong><small><span class="online-dot"></span>Anfitrião</small></div><span class="host-crown" aria-label="Anfitrião">✦</span></div>${host ? view.viewers.map((person) => `<div class="person"><span class="avatar viewer-avatar">${escape(person.name.charAt(0).toLocaleUpperCase('pt-BR'))}</span><div><strong>${escape(person.name)}</strong><small class="${person.failed ? 'failed-text' : ''}">${person.failed ? 'Falha de vídeo · reinicie a transmissão' : !view.sharing ? 'Na sala' : person.connected ? 'Assistindo agora' : 'Conectando ao vídeo…'}</small></div><button class="icon-button remove-button" data-action="kick" data-peer="${escape(person.id)}" title="Remover ${escape(person.name)}" aria-label="Remover ${escape(person.name)} da sala">${icon('close')}</button></div>`).join('') : `<div class="person"><span class="avatar viewer-avatar">${escape(view.displayName.charAt(0).toLocaleUpperCase('pt-BR'))}</span><div><strong>${escape(view.displayName)} <span>(você)</span></strong><small>Espectador</small></div></div>`}${host && !view.viewers.length ? `<div class="empty-people">${icon('users')}<p>Tem espaço para a sua turma.<br>Compartilhe o código para começar.</p></div>` : ''}</section><div class="room-note">${icon('shield')}<p>${host ? `Até ${room.maxViewers} amigos podem assistir. Cada conexão usa a internet do seu computador.` : 'O anfitrião controla a transmissão e pode encerrá-la a qualquer momento.'}</p></div></aside></div>
  ${view.connectionIssue ? `<div class="connection-alert" role="alert">${icon('alert')}<p>${renderConnectionIssue(view.connectionIssue)}</p><button class="button subtle" data-action="rejoin">${icon('refresh')} Entrar novamente</button></div>` : ''}
  ${host && view.sharing ? `<div class="sharing-reminder">${icon('screen')} Sua tela está sendo transmitida. Tudo que aparecer na área escolhida poderá ser visto.</div>` : ''}`;
}
