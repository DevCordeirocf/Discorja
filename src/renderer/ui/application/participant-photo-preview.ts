const GESTURE_TIP_KEY = 'discorja-participant-gesture-tip-seen';

function showGestureTipOnce(): void {
  let seen = false;
  try {
    seen = localStorage.getItem(GESTURE_TIP_KEY) === 'true';
  } catch {
    // The hint still works when storage is unavailable.
  }
  if (seen || document.querySelector('.participant-gesture-tip')) return;

  const tip = document.createElement('div');
  tip.className = 'participant-gesture-tip';
  tip.setAttribute('role', 'status');
  const copy = document.createElement('span');
  copy.textContent =
    'Botão direito amplia a foto. Botão esquerdo abre a transmissão quando disponível.';
  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', 'Fechar dica');
  close.textContent = '×';
  tip.append(copy, close);
  document.body.append(tip);
  close.addEventListener('click', () => tip.remove());
  window.setTimeout(() => tip.remove(), 7_000);
  try {
    localStorage.setItem(GESTURE_TIP_KEY, 'true');
  } catch {
    // Avoid blocking participant actions when storage is unavailable.
  }
}

function openParticipantPhoto(media: HTMLElement): void {
  document.querySelector('.participant-photo-overlay')?.remove();
  const card = media.closest<HTMLElement>('.participant-card');
  const name =
    media.querySelector('strong')?.textContent?.trim() ?? 'Participante';
  const image = media.querySelector<HTMLImageElement>('.avatar img');
  const overlay = document.createElement('div');
  overlay.className = 'participant-photo-overlay';
  overlay.setAttribute('role', 'presentation');

  const dialog = document.createElement('section');
  dialog.className = 'participant-photo-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', `Foto de ${name}`);

  const close = document.createElement('button');
  close.className = 'participant-photo-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Fechar foto');
  close.textContent = '×';

  const portrait = document.createElement('div');
  portrait.className = 'participant-photo-portrait';
  if (image) {
    const enlarged = document.createElement('img');
    enlarged.src = image.src;
    enlarged.alt = `Foto de ${name}`;
    enlarged.draggable = false;
    portrait.append(enlarged);
  } else {
    portrait.classList.add('is-placeholder');
    portrait.textContent =
      card
        ?.querySelector('.participant-card-caption strong')
        ?.textContent?.trim()
        .charAt(0)
        .toLocaleUpperCase('pt-BR') ?? '?';
  }

  const caption = document.createElement('p');
  caption.textContent = name;
  dialog.append(close, portrait, caption);
  overlay.append(dialog);
  document.body.append(overlay);

  const dismiss = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKeyDown);
  };
  const onKeyDown = (keyEvent: KeyboardEvent) => {
    if (keyEvent.key === 'Escape') dismiss();
  };
  close.addEventListener('click', dismiss);
  overlay.addEventListener('click', (clickEvent) => {
    if (clickEvent.target === overlay) dismiss();
  });
  document.addEventListener('keydown', onKeyDown);
  close.focus();
}

export function bindParticipantPhotoPreview(root: HTMLElement): void {
  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const card = target.closest<HTMLElement>('.participant-card');
    if (!card || !root.contains(card)) return;
    showGestureTipOnce();

    const photoButton = target.closest('.participant-photo-open');
    const media = photoButton?.querySelector<HTMLElement>(
      '.participant-card-media',
    );
    if (media) openParticipantPhoto(media);
  });

  root.addEventListener('contextmenu', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const media = target.closest<HTMLElement>('.participant-card-media');
    if (!media || !root.contains(media)) return;

    event.preventDefault();
    showGestureTipOnce();
    openParticipantPhoto(media);
  });
}
