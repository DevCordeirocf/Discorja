import { sniffImage } from '../../../shared/image-magic';
import { processAnimatedFile } from './animated-avatar';

// Match the Aceternity component's default webcam grid: 64 columns × 48 rows.
const GRID_WIDTH = 64;
const GRID_HEIGHT = 48;
const PHOTO_SIZE = 256;
const MAX_FILE_SIZE = 16 * 1024 * 1024;
const CAMERA_ACTIVE_STATUS = 'Câmera ativa · prévia com grade pixelada.';

/** What Configurações › Perfil shows about the camera and the photo. */
export interface ProfileCameraState {
  /** The pixelated preview is live. */
  active: boolean;
  /** Waiting for camera access. */
  starting: boolean;
  /** A GIF or WebP is being converted, so saving waits for it. */
  processing: boolean;
  status: string;
}

export function bindProfileCamera(options: {
  root: HTMLElement;
  onPhoto(photo: string): void;
  /** The camera state changed; the app renders it. */
  onChange(): void;
}): { state(): ProfileCameraState; afterRender(): void } {
  let stream: MediaStream | null = null;
  let frame = 0;
  // React keeps the panel's <video> and <canvas> while Perfil stays open.
  let liveVideo: HTMLVideoElement | null = null;
  const state: ProfileCameraState = {
    active: false,
    starting: false,
    processing: false,
    status: '',
  };
  const update = (patch: Partial<ProfileCameraState>): void => {
    Object.assign(state, patch);
    options.onChange();
  };

  const preview = (): HTMLElement | null =>
    options.root.querySelector<HTMLElement>('#profile-photo-preview');

  /** Stops the camera; `notify` is false when a render follows anyway. */
  const stopCamera = (notify = true): void => {
    cancelAnimationFrame(frame);
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    if (liveVideo) liveVideo.srcObject = null;
    liveVideo = null;
    Object.assign(state, { active: false, starting: false });
    if (notify) options.onChange();
  };

  const processImageFile = async (file: File): Promise<string> => {
    if (file.size > MAX_FILE_SIZE)
      throw new Error('A imagem precisa ter até 16 MB.');
    // The file's bytes decide the format; names and MIME types can lie.
    const kind = sniffImage(
      new Uint8Array(await file.slice(0, 64).arrayBuffer()),
    );
    if (!kind)
      throw new Error(
        'Formato não suportado. Use JPG, PNG, WebP ou GIF (não MP4).',
      );
    if (kind.type === 'gif' || kind.type === 'webp') {
      update({ status: 'Processando a animação…' });
      try {
        return await processAnimatedFile(file, `image/${kind.type}`);
      } catch (error) {
        // A WebP that is not animated still works as a still photo.
        if (kind.type === 'gif') throw error;
      }
    }
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = PHOTO_SIZE;
      canvas.height = PHOTO_SIZE;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Não foi possível processar a imagem.');
      // JPEG has no transparency; use the app surface instead of black.
      context.fillStyle = '#22232d';
      context.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
      const side = Math.min(bitmap.width, bitmap.height);
      context.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        PHOTO_SIZE,
        PHOTO_SIZE,
      );
      return canvas.toDataURL('image/jpeg', 0.86);
    } finally {
      bitmap.close();
    }
  };

  const startCamera = async (): Promise<void> => {
    update({ starting: true, status: 'Aguardando acesso à câmera…' });
    try {
      let cameraStream: MediaStream;
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 24, max: 30 },
          },
        });
      } catch (error) {
        if (
          !(error instanceof DOMException) ||
          !['NotReadableError', 'OverconstrainedError', 'AbortError'].includes(
            error.name,
          )
        ) {
          throw error;
        }
        // Some Windows camera drivers fail when Chromium requests their preferred
        // capture mode. Retry with a small, low-rate stream before giving up.
        cameraStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            width: { ideal: 320 },
            height: { ideal: 240 },
            frameRate: { ideal: 15, max: 20 },
          },
        });
      }
      const video = options.root.querySelector<HTMLVideoElement>(
        '#profile-camera-video',
      );
      const canvas = options.root.querySelector<HTMLCanvasElement>(
        '#profile-camera-canvas',
      );
      const context = canvas?.getContext('2d', { alpha: false });
      if (!video || !canvas || !context || !canvas.isConnected) {
        cameraStream.getTracks().forEach((track) => track.stop());
        Object.assign(state, { starting: false, status: '' });
        return;
      }
      stream = cameraStream;
      liveVideo = video;
      video.srcObject = stream;
      canvas.width = GRID_WIDTH;
      canvas.height = GRID_HEIGHT;
      const pixelSource = document.createElement('canvas');
      pixelSource.width = GRID_WIDTH;
      pixelSource.height = GRID_HEIGHT;
      const pixelContext = pixelSource.getContext('2d', {
        willReadFrequently: true,
      });
      if (!pixelContext) {
        cameraStream.getTracks().forEach((track) => track.stop());
        stream = null;
        update({
          starting: false,
          status: 'Não foi possível preparar a prévia da câmera.',
        });
        return;
      }
      const previousLuma = new Float32Array(GRID_WIDTH * GRID_HEIGHT);
      const elevations = new Float32Array(GRID_WIDTH * GRID_HEIGHT);
      let hasPreviousFrame = false;
      update({ active: true, starting: false });
      await video.play();
      if (!stream) return;
      update({ status: CAMERA_ACTIVE_STATUS });

      const drawFrame = (): void => {
        if (!stream) {
          stopCamera();
          return;
        }
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          const sourceAspect = GRID_WIDTH / GRID_HEIGHT;
          const videoAspect = video.videoWidth / video.videoHeight;
          const sourceWidth =
            videoAspect > sourceAspect
              ? video.videoHeight * sourceAspect
              : video.videoWidth;
          const sourceHeight =
            videoAspect > sourceAspect
              ? video.videoHeight
              : video.videoWidth / sourceAspect;
          const x = (video.videoWidth - sourceWidth) / 2;
          const y = (video.videoHeight - sourceHeight) / 2;
          pixelContext.save();
          pixelContext.translate(GRID_WIDTH, 0);
          pixelContext.scale(-1, 1);
          pixelContext.drawImage(
            video,
            x,
            y,
            sourceWidth,
            sourceHeight,
            0,
            0,
            GRID_WIDTH,
            GRID_HEIGHT,
          );
          pixelContext.restore();
          const pixels = pixelContext.getImageData(
            0,
            0,
            GRID_WIDTH,
            GRID_HEIGHT,
          );
          context.fillStyle = '#262626';
          context.fillRect(0, 0, GRID_WIDTH, GRID_HEIGHT);
          const gap = 0.035;
          for (let row = 0; row < GRID_HEIGHT; row += 1) {
            for (let column = 0; column < GRID_WIDTH; column += 1) {
              const cell = row * GRID_WIDTH + column;
              const offset = cell * 4;
              const red = pixels.data[offset];
              const green = pixels.data[offset + 1];
              const blue = pixels.data[offset + 2];
              const luma = (red * 0.299 + green * 0.587 + blue * 0.114) / 255;
              const motion = hasPreviousFrame
                ? Math.abs(luma - previousLuma[cell])
                : 0;
              previousLuma[cell] = luma;
              const targetElevation = Math.min(
                1.25,
                0.035 + Math.max(0, motion - 0.045) * 4.2,
              );
              elevations[cell] += (targetElevation - elevations[cell]) * 0.1;

              const cellX = column + gap / 2;
              const cellY = row + gap / 2;
              const cellSize = 1 - gap;
              const lift = elevations[cell] * 1.25;
              const topY = cellY - lift;
              const topRed = Math.min(255, Math.round(red * 0.78 + lift * 13));
              const topGreen = Math.min(
                255,
                Math.round(green * 0.78 + lift * 13),
              );
              const topBlue = Math.min(
                255,
                Math.round(blue * 0.78 + lift * 13),
              );

              if (lift > 0.04) {
                context.beginPath();
                context.moveTo(cellX, topY + cellSize);
                context.lineTo(cellX + cellSize, topY + cellSize);
                context.lineTo(cellX + cellSize, cellY + cellSize);
                context.lineTo(cellX, cellY + cellSize);
                context.closePath();
                context.fillStyle = `rgb(${Math.round(red * 0.28)} ${Math.round(green * 0.28)} ${Math.round(blue * 0.28)})`;
                context.fill();
              }

              context.fillStyle = `rgb(${topRed} ${topGreen} ${topBlue})`;
              context.fillRect(cellX, topY, cellSize, cellSize);
              context.strokeStyle = 'rgb(255 255 255 / 8%)';
              context.lineWidth = 0.035;
              context.strokeRect(cellX, topY, cellSize, cellSize);
            }
          }
          hasPreviousFrame = true;
        }
        frame = requestAnimationFrame(drawFrame);
      };
      frame = requestAnimationFrame(drawFrame);
    } catch (error) {
      stopCamera(false);
      update({
        status:
          error instanceof DOMException && error.name === 'NotAllowedError'
            ? 'Permita o acesso à câmera para tirar uma foto.'
            : error instanceof DOMException && error.name === 'NotReadableError'
              ? 'A câmera está ocupada ou indisponível. Feche outros apps que a estejam usando e tente novamente.'
              : 'Não foi possível abrir a câmera neste dispositivo.',
      });
    }
  };

  options.root.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      'button[data-action]',
    );
    const action = button?.dataset.action;
    if (action === 'profile-choose-photo') {
      options.root
        .querySelector<HTMLInputElement>('#profile-photo-file')
        ?.click();
    } else if (action === 'profile-start-camera') {
      void startCamera();
    } else if (action === 'profile-capture') {
      const canvas = options.root.querySelector<HTMLCanvasElement>(
        '#profile-camera-canvas',
      );
      if (!canvas || !stream || button?.disabled) return;
      const image = document.createElement('canvas');
      image.width = PHOTO_SIZE;
      image.height = PHOTO_SIZE;
      const context = image.getContext('2d');
      if (!context) return;
      context.imageSmoothingEnabled = false;
      const squareSide = Math.min(canvas.width, canvas.height);
      context.drawImage(
        canvas,
        (canvas.width - squareSide) / 2,
        (canvas.height - squareSide) / 2,
        squareSide,
        squareSide,
        0,
        0,
        PHOTO_SIZE,
        PHOTO_SIZE,
      );
      const photo = image.toDataURL('image/jpeg', 0.9);
      stopCamera(false);
      // onPhoto renders the new photo; the camera status no longer applies.
      state.status = '';
      options.onPhoto(photo);
    } else if (action === 'profile-stop-camera') {
      stopCamera(false);
      update({ status: 'Câmera desligada.' });
    } else if (action === 'profile-remove-photo') {
      stopCamera(false);
      state.status = '';
      options.onPhoto('');
    }
  });

  options.root.addEventListener('change', (event) => {
    const input = event.target;
    if (
      !(input instanceof HTMLInputElement) ||
      input.id !== 'profile-photo-file' ||
      !input.files?.[0]
    )
      return;
    const file = input.files[0];
    update({ processing: true });
    void processImageFile(file)
      .then((photo) => {
        stopCamera(false);
        // onPhoto renders the new photo with the cleared state.
        Object.assign(state, { processing: false, status: '' });
        options.onPhoto(photo);
      })
      .catch((error: unknown) => {
        update({
          processing: false,
          status:
            error instanceof Error
              ? error.message
              : 'Não foi possível carregar essa foto.',
        });
      })
      .finally(() => {
        input.value = '';
      });
  });

  return {
    state: () => ({ ...state }),
    afterRender: () => {
      // Leaving Perfil removes the preview; the camera stops with it.
      if (stream && !preview()) {
        stopCamera(false);
        state.status = '';
      }
    },
  };
}
