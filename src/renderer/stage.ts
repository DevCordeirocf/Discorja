import type { MultiRoomState } from '../shared/protocol';

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
const screenIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>';
export interface StageView {
  state: MultiRoomState;
  watching: string | null;
  sharing: boolean;
  hasRemote: boolean;
  hasLocal: boolean;
  sourceName: string;
  busy: boolean;
  issue: string;
  recovering: boolean;
}

/** Cards are metadata only: no hidden remote video, audio or preview subscriptions. */
export function renderStage(view: StageView): string {
  const { state } = view;
  const self = state.participants.find(
    (person) => person.peerId === state.selfId,
  )!;
  const owner = state.ownerId === state.selfId;
  const moderate = owner || self.role === 'moderator';
  const selected = state.publications.find(
    (publication) => publication.publicationId === view.watching,
  );
  const selectedPerson = state.participants.find(
    (person) => person.peerId === selected?.publisherId,
  );
  const showingLocal = !view.watching && view.hasLocal;
  const showingVideo = view.watching ? view.hasRemote : showingLocal;
  const name = showingLocal
    ? 'Sua prévia'
    : (selectedPerson?.name ?? 'Escolha uma transmissão');
  const slotsFull =
    state.publications.length >= state.maxPublishers && !view.sharing;
  const receptionStatus = showingLocal
    ? 'Prévia local · sempre sem som'
    : view.issue && view.watching
      ? 'Conexão interrompida · tente novamente'
      : view.watching
        ? view.recovering || selected?.connected === false
          ? 'Recuperando a transmissão escolhida'
          : view.hasRemote
            ? 'Recebendo somente esta transmissão'
            : 'Conectando à transmissão escolhida'
        : 'As outras telas não consomem vídeo em segundo plano';
  const cards = state.publications
    .map((publication) => {
      const person = state.participants.find(
        (entry) => entry.peerId === publication.publisherId,
      )!;
      const own = person.peerId === state.selfId;
      const active =
        publication.publicationId === view.watching || (own && showingLocal);
      return `<article class="screen-card ${active ? 'selected' : ''}" data-publication="${escape(publication.publicationId)}"><div class="screen-card-art"><span class="screen-monogram">${escape(person.name.charAt(0).toUpperCase())}</span><span class="screen-live ${publication.connected ? '' : 'recovering'}">${publication.connected ? 'AO VIVO' : 'RECONECTANDO'}</span>${screenIcon}</div><div class="screen-card-body"><div><strong>${escape(person.name)}${own ? ' <span>(você)</span>' : ''}</strong><small>${publication.audio ? 'Tela + som do computador' : 'Somente tela'} · ${publication.watchers} assistindo</small></div><button class="button ${active ? 'secondary' : 'primary'}" data-action="${own ? 'preview-own' : 'watch-screen'}" data-publication="${escape(publication.publicationId)}" ${!publication.connected && !active ? 'disabled' : ''} aria-pressed="${active}" aria-label="${own ? 'Ver minha prévia' : `Assistir transmissão de ${escape(person.name)}`}">${active ? (own ? 'Sua prévia' : 'Assistindo') : own ? 'Ver prévia' : 'Assistir'}</button></div></article>`;
    })
    .join('');
  const people = state.participants
    .map((person) => {
      const publication = state.publications.find(
        (entry) => entry.publisherId === person.peerId,
      );
      const canRemove =
        moderate &&
        person.peerId !== state.selfId &&
        person.role !== 'owner' &&
        (owner || person.role !== 'moderator');
      const actions = `${moderate && publication && person.peerId !== state.selfId ? `<button class="button subtle" data-action="stop-publication" data-peer="${escape(person.peerId)}">Encerrar tela de ${escape(person.name)}</button>` : ''}${owner && person.role !== 'owner' ? `<button class="button subtle" data-action="set-moderator" data-peer="${escape(person.peerId)}" data-enabled="${person.role !== 'moderator'}">${person.role === 'moderator' ? 'Retirar moderação de' : 'Tornar moderador'} ${escape(person.name)}</button>` : ''}${canRemove ? `<button class="button subtle danger-text" data-action="kick" data-peer="${escape(person.peerId)}" aria-label="Remover ${escape(person.name)} da sala">Remover da sala</button>` : ''}`;
      return `<div class="person"><span class="avatar ${publication ? 'broadcasting-avatar' : ''}">${escape(person.name.charAt(0).toUpperCase())}</span><div><strong>${escape(person.name)}${person.peerId === state.selfId ? ' <span>(você)</span>' : ''}</strong><small>${person.role === 'owner' ? 'Dono' : person.role === 'moderator' ? 'Moderador' : 'Participante'} · ${!person.connected ? 'Reconectando' : publication ? 'Transmitindo' : 'Na sala'}</small></div>${actions ? `<details class="member-menu" data-peer="${escape(person.peerId)}"><summary aria-label="Ações de ${escape(person.name)}">···</summary><div>${actions}</div></details>` : ''}</div>`;
    })
    .join('');
  return `<section class="room-header multi-room-header"><div><span class="eyebrow">O ENCONTRO ESTÁ ACONTECENDO</span><h1>${escape(state.name)}</h1><p>${state.publications.length} de ${state.maxPublishers} telas ao vivo · Uma transmissão por vez para assistir</p></div><div class="audio-actions"><button class="button subtle" data-action="rooms">Salas</button><button class="button subtle danger-text" data-action="leave">${owner ? 'Encerrar sala' : 'Sair da sala'}</button></div></section>
  <div class="local-sharebar"><div class="local-share-status">${screenIcon}<div><strong>${view.sharing ? 'Você está compartilhando' : 'Sua tela, sua escolha'}</strong><small>${view.sharing ? escape(view.sourceName) : slotsFull ? 'Os espaços de transmissão estão ocupados.' : 'Você pode compartilhar e continuar assistindo a outra pessoa.'}</small></div></div>${view.sharing ? '<button class="button stop-button" data-action="stop">Parar de compartilhar</button>' : `<button class="button primary" data-action="choose-source" ${view.busy || slotsFull ? 'disabled' : ''}>Compartilhar minha tela</button>`}</div>
  <div class="room-grid multi-room-grid"><div class="screen-workspace"><section class="screen-picker" aria-labelledby="screens-heading"><div class="section-heading"><h2 id="screens-heading">Telas disponíveis</h2><span>${state.publications.length ? 'Escolha quem acompanhar' : 'A primeira tela pode ser a sua'}</span></div>${cards ? `<div class="screen-cards">${cards}</div>` : '<div class="no-screens"><strong>O espaço está pronto para sua turma.</strong><p>Quando alguém compartilhar, a tela aparecerá aqui. Clique em Assistir para acompanhar.</p></div>'}</section>
  <section class="broadcast-panel" aria-label="Transmissão em destaque"><div class="broadcast-heading"><div class="host-label"><span class="avatar">${screenIcon}</span><div><strong>${escape(name)}</strong><small>${escape(receptionStatus)}</small></div></div>${view.watching ? '<button class="button subtle" data-action="stop-watching">Parar de assistir</button>' : ''}</div><div class="video-stage ${showingVideo ? 'has-video' : ''}">${view.watching && view.recovering && view.hasRemote ? '<div class="video-reconnecting">Recuperando a transmissão…</div>' : ''}${showingVideo ? '<video id="stream-video" autoplay playsinline muted aria-label="Transmissão em destaque"></video>' : `<div class="empty-stream"><div class="empty-screen-icon">${screenIcon}</div><h2>${view.issue ? 'Conexão interrompida' : view.watching ? (view.recovering || selected?.connected === false ? 'Recuperando a transmissão…' : 'Conectando à transmissão…') : 'O que vamos acompanhar?'}</h2><p>${view.watching ? 'A tela escolhida aparece aqui assim que a conexão estiver pronta.' : 'Escolha Assistir em um dos cartões acima.<br>Você pode transmitir sua tela ao mesmo tempo.'}</p></div>`}</div><div class="broadcast-controls"><span>${screenIcon}<span>${showingLocal ? 'Sua prévia não usa download' : view.watching ? `Assistindo a ${escape(selectedPerson?.name ?? 'uma transmissão')}` : 'Nenhuma transmissão selecionada'}</span></span>${showingVideo ? '<button class="button subtle" data-action="fullscreen">Tela cheia</button>' : ''}</div></section>
  ${view.issue ? `<div class="connection-alert" role="alert"><p>${escape(view.issue)}</p><button class="button subtle" data-action="retry-watching">Tentar novamente</button></div>` : ''}</div><aside class="room-sidebar">${view.hasLocal && view.watching ? '<section class="local-preview-card"><div class="section-heading"><h2>Sua prévia</h2><span>SEM SOM</span></div><video id="local-preview" autoplay playsinline muted aria-label="Prévia da sua transmissão"></video><p>Você continua transmitindo enquanto assiste.</p></section>' : ''}<section class="people-card"><div class="section-heading"><h2>Na sala</h2><span>${state.participants.length}/${state.maxParticipants}</span></div>${people}</section><section class="invite-card compact-invite"><div class="mini-heading">CONVIDE SUA TURMA</div><div class="room-code" aria-label="Código da sala">${escape(state.code.slice(0, 4))}<span></span>${escape(state.code.slice(4))}</div><button class="button secondary wide" data-action="copy">Copiar código</button><small>Mesmo servidor, aplicativo compatível.</small></section><div class="room-note"><p>Ao trocar de tela, a reprodução anterior é encerrada. As outras transmissões continuam para quem estiver assistindo.</p></div></aside></div>`;
}
