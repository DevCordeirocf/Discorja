import type { MultiRoomState } from '../../shared/protocol';
import { escapeHtml as escape } from '../html';
import { designIcon } from './design';

export interface StageView {
  state: MultiRoomState;
  watching: string | null;
  sharing: boolean;
  hasRemote: boolean;
  hasLocal: boolean;
  busy: boolean;
  issue: string;
  recovering: boolean;
  audioControl?: string;
  playerAudioControl?: string;
}

/** The participant list is the only place to choose a live publication. */
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
  const slotsFull =
    state.publications.length >= state.maxPublishers && !view.sharing;
  const receptionStatus = showingLocal
    ? 'Sua prévia · sem som'
    : view.watching
      ? view.recovering || selected?.connected === false
        ? 'Reconectando…'
        : view.hasRemote
          ? `Assistindo a ${selectedPerson?.name ?? 'uma transmissão'}`
          : 'Conectando…'
      : 'Escolha uma tela ao vivo para assistir';

  const actionsFor = (person: (typeof state.participants)[number]) => {
    const publication = state.publications.find(
      (entry) => entry.publisherId === person.peerId,
    );
    const canRemove =
      moderate &&
      person.peerId !== state.selfId &&
      person.role !== 'owner' &&
      (owner || person.role !== 'moderator');
    const actions = `${moderate && publication && person.peerId !== state.selfId ? `<button class="button subtle" data-action="stop-publication" data-peer="${escape(person.peerId)}">Encerrar tela de ${escape(person.name)}</button>` : ''}${owner && person.role !== 'owner' ? `<button class="button subtle" data-action="set-moderator" data-peer="${escape(person.peerId)}" data-enabled="${person.role !== 'moderator'}">${person.role === 'moderator' ? 'Retirar moderação de' : 'Tornar moderador'} ${escape(person.name)}</button>` : ''}${canRemove ? `<button class="button subtle danger-text" data-action="kick" data-peer="${escape(person.peerId)}" aria-label="Remover ${escape(person.name)} da sala">Remover da sala</button>` : ''}`;
    return actions
      ? `<details class="member-menu" data-peer="${escape(person.peerId)}"><summary aria-label="Ações de ${escape(person.name)}">···</summary><div>${actions}</div></details>`
      : '';
  };

  const livePeople = state.participants
    .filter((person) =>
      state.publications.some((entry) => entry.publisherId === person.peerId),
    )
    .map((person) => {
      const publication = state.publications.find(
        (entry) => entry.publisherId === person.peerId,
      )!;
      const own = person.peerId === state.selfId;
      const active =
        publication.publicationId === view.watching || (own && showingLocal);
      const action = own ? 'preview-own' : 'watch-screen';
      const reconnecting = !publication.connected;
      const stateLabel = reconnecting
        ? 'Reconectando…'
        : active
          ? own
            ? 'Sua prévia'
            : 'Assistindo agora'
          : 'Clique para assistir';
      return `<div class="person live-stream-person ${active ? 'selected' : ''}"><button class="person-stream-choice" data-action="${action}" data-publication="${escape(publication.publicationId)}" ${reconnecting && !active ? 'disabled' : ''} aria-pressed="${active}" aria-label="${own ? 'Ver minha prévia' : `Assistir transmissão de ${escape(person.name)}`}" title="${own ? 'Mostrar sua prévia' : `Assistir à transmissão de ${escape(person.name)}`}" ><span class="avatar ${active ? 'broadcasting-avatar' : ''}">${escape(person.name.charAt(0).toLocaleUpperCase('pt-BR'))}</span><span class="person-copy"><strong>${escape(person.name)}${own ? ' <span>(você)</span>' : ''}</strong><small>${stateLabel}</small></span><span class="live-indicator">AO VIVO</span></button>${actionsFor(person)}</div>`;
    })
    .join('');

  const otherPeople = state.participants
    .filter(
      (person) =>
        !state.publications.some(
          (entry) => entry.publisherId === person.peerId,
        ),
    )
    .map(
      (person) =>
        `<div class="person"><span class="avatar">${escape(person.name.charAt(0).toLocaleUpperCase('pt-BR'))}</span><div class="person-copy"><strong>${escape(person.name)}${person.peerId === state.selfId ? ' <span>(você)</span>' : ''}</strong><small>${!person.connected ? 'Reconectando…' : person.role === 'owner' ? 'Dono da sala' : person.role === 'moderator' ? 'Moderador' : 'Na sala'}</small></div>${actionsFor(person)}</div>`,
    )
    .join('');

  return `<section class="room-header multi-room-header"><div><h1>${escape(state.name)}</h1><div class="room-meta"><p>Código: <span class="room-code" aria-label="Código da sala">${escape(state.code)}</span></p><button class="text-button" data-action="manage-rooms">Outras salas</button></div></div><div class="room-header-actions"><button class="button secondary" data-action="copy">Copiar convite</button><button class="button subtle danger-text" data-action="leave">${owner ? 'Encerrar sala' : 'Sair da sala'}</button></div></section>
  <div class="room-grid multi-room-grid"><div class="screen-workspace"><section class="broadcast-panel" aria-label="Transmissão em destaque"><div class="video-stage ${showingVideo ? 'has-video' : ''}">${view.watching && view.recovering && view.hasRemote ? '<div class="video-reconnecting">Reconectando à transmissão…</div>' : ''}${showingVideo ? '<video id="stream-video" autoplay playsinline muted aria-label="Transmissão em destaque"></video>' : `<div class="empty-stream">${designIcon('screenInactive')}<h2>${view.issue ? 'Conexão interrompida' : view.watching ? 'Conectando à transmissão…' : 'Nenhuma transmissão selecionada'}</h2><p>${view.watching ? 'Aguardando o vídeo da transmissão.' : 'Compartilhe sua tela ou escolha uma tela ao vivo.'}</p></div>`}<button class="diagnostics-trigger" data-action="show-diagnostics" aria-label="Abrir diagnóstico da conexão" title="Diagnóstico">${designIcon('network')}</button>${view.playerAudioControl ?? ''}</div><div class="broadcast-controls stage-toolbar"><div class="stage-stream-info"><small>${escape(receptionStatus)}</small></div><div class="stage-toolbar-actions">${view.audioControl ?? ''}${view.sharing ? '<button class="button stop-button" data-action="stop">Parar transmissão</button>' : `<button class="button primary" data-action="choose-source" ${view.busy || slotsFull ? 'disabled' : ''}>Compartilhar tela</button>`}${showingVideo ? `<button class="button subtle icon-button" data-action="fullscreen" aria-label="Tela cheia" title="Tela cheia">${designIcon('expand')}</button>` : ''}</div></div></section>${view.issue ? `<div class="connection-alert" role="alert"><p>${escape(view.issue)}</p><button class="button subtle" data-action="retry-watching">Tentar novamente</button></div>` : ''}</div><aside class="room-sidebar"><section class="people-card" aria-label="Pessoas na sala"><div class="section-heading"><h2>Participantes · ${state.participants.length}</h2><span class="sr-only">Limite de ${state.maxParticipants} participantes</span></div>${state.publications.length ? `<div class="people-group"><h3>Telas ao vivo · ${state.publications.length}</h3>${livePeople}</div>` : ''}${otherPeople ? `<div class="people-group"><h3>Na sala</h3>${otherPeople}</div>` : ''}</section></aside></div>`;
}
