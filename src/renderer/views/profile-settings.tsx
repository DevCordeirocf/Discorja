import { DISPLAY_NAME_MAX } from '../../shared/validation';
import type { ProfileCameraState } from '../features/profile/profile-camera';
import { SyncedInput } from '../ui/components/synced-input';
import { OnlineChip } from './people';
import {
  GROUP,
  GroupTitle,
  ROW_NOTE,
  ROW_TITLE,
  SettingsGroup,
  SettingsRow,
  SettingsSection,
} from './settings-parts';

export interface ProfileSettingsProps {
  /** The draft being edited: saved values until something changes. */
  draft: { name: string; photo: string };
  camera: ProfileCameraState;
}

const PHOTO_BUTTON = 'min-w-0 px-[14px] py-2.5 text-[12px]';

/**
 * Configurações › Perfil. The camera controller (features/profile) finds the
 * file input, <video> and <canvas> by id; React keeps them while Perfil is open.
 */
export function ProfileSettings({ draft, camera }: ProfileSettingsProps) {
  const name = draft.name.trim();
  const initial = name.charAt(0).toLocaleUpperCase('pt-BR') || '?';
  const shownName = name || 'Seu nome';
  const active = camera.active;
  return (
    <SettingsSection
      id="settings-profile-heading"
      title="Perfil"
      description="Como as pessoas vão reconhecer você."
    >
      <GroupTitle>Foto</GroupTitle>
      <div
        className={`${GROUP} flex flex-row items-center gap-6 p-5 transition-[gap] duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-[0.01ms]`}
      >
        <div
          id="profile-photo-preview"
          className={`relative grid flex-none place-items-center overflow-hidden rounded-[50%] border border-[#665477] bg-[#111015] transition-[width,height,border-radius,box-shadow] duration-[700ms,700ms,550ms,550ms] ease-[cubic-bezier(0.22,1,0.36,1),cubic-bezier(0.22,1,0.36,1),cubic-bezier(0.22,1,0.36,1),ease] motion-reduce:duration-[0.01ms] [&>*]:[grid-area:1/1] ${active ? 'size-[220px] shadow-[0_0_0_1px_rgb(160_122_190/18%),0_18px_48px_rgb(0_0_0/30%)]' : 'size-[120px] shadow-none'}`}
        >
          <img
            id="profile-photo-image"
            className="size-full object-cover"
            src={draft.photo || undefined}
            alt="Sua foto de perfil"
            hidden={!draft.photo || active}
          />
          <span
            id="profile-photo-fallback"
            className="avatar grid size-full place-items-center rounded-[50%] border-0 text-[44px]"
            hidden={!!draft.photo || active}
          >
            {initial}
          </span>
          <video id="profile-camera-video" autoPlay muted playsInline hidden />
          <canvas
            id="profile-camera-canvas"
            className="block size-full object-cover [image-rendering:pixelated] transition-opacity duration-[220ms] ease-[ease]"
            hidden={!active}
            aria-label="Prévia pixelada da câmera"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex w-full flex-wrap justify-start gap-2">
            <input
              id="profile-photo-file"
              type="file"
              accept="image/gif,image/jpeg,image/png,image/webp"
              hidden
            />
            <button
              type="button"
              className={`button primary ${PHOTO_BUTTON}`}
              data-action="profile-choose-photo"
            >
              Escolher mídia
            </button>
            <button
              type="button"
              className={`button secondary ${PHOTO_BUTTON}`}
              data-action="profile-start-camera"
              disabled={camera.starting}
              hidden={active}
            >
              Abrir câmera
            </button>
            <button
              type="button"
              className={`button primary ${PHOTO_BUTTON}`}
              data-action="profile-capture"
              disabled={!active}
              hidden={!active}
            >
              Tirar foto
            </button>
            <button
              type="button"
              className={`button subtle ${PHOTO_BUTTON}`}
              data-action="profile-stop-camera"
              hidden={!active}
            >
              Cancelar câmera
            </button>
            {draft.photo && (
              <button
                type="button"
                className={`button subtle danger-text ${PHOTO_BUTTON}`}
                data-action="profile-remove-photo"
              >
                Remover foto
              </button>
            )}
          </div>
          <p className="m-0 text-[12px] leading-[1.8] text-kbd">
            JPG, PNG, WebP ou GIF animado.{' '}
            <a
              href="https://giphy.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Procurar GIFs no GIPHY
            </a>
          </p>
          <p
            id="profile-camera-status"
            className="m-0 min-h-0 text-left text-[11px] text-muted transition-[margin] duration-[350ms] ease-[ease] empty:hidden motion-reduce:duration-[0.01ms]"
            role="status"
          >
            {camera.status}
          </p>
        </div>
      </div>
      <GroupTitle>Identificação</GroupTitle>
      <SettingsGroup>
        <SettingsRow
          copy={
            <>
              <label className={ROW_TITLE} htmlFor="profile-name">
                Nome de exibição
              </label>
              <small className={ROW_NOTE}>
                Aparece nas salas e em "Online agora".
              </small>
            </>
          }
          control={
            <SyncedInput
              id="profile-name"
              className="text-input h-[38px] w-[280px] rounded-[10px] bg-[#0f1014]"
              autoComplete="nickname"
              maxLength={DISPLAY_NAME_MAX}
              required
              placeholder="Seu nome"
              value={draft.name}
            />
          }
        />
      </SettingsGroup>
      <GroupTitle>Como você aparece</GroupTitle>
      <SettingsGroup
        className={`${GROUP} flex flex-row items-start gap-7 p-5`}
        label="Prévia do seu perfil"
      >
        <div className="flex flex-col gap-2">
          <small className="text-[12px] text-kbd">Online agora</small>
          <OnlineChip
            className="self-start"
            photo={draft.photo}
            initial={initial}
            tone="overflow-hidden bg-raised text-text"
          >
            <span>{shownName}</span>
          </OnlineChip>
        </div>
        <div className="flex flex-col gap-2">
          <small className="text-[12px] text-kbd">Na sala</small>
          {/* Same 4:3 tile as the room's participant cards. */}
          <span className="relative block aspect-[4/3] w-[136px] overflow-hidden rounded-[12px] border border-[#2b2c37]">
            <span
              className="absolute inset-0 grid place-items-center bg-raised text-[24px] text-text"
              aria-hidden="true"
            >
              {draft.photo ? (
                <img
                  className="size-full object-cover"
                  src={draft.photo}
                  alt=""
                />
              ) : (
                <span>{initial}</span>
              )}
            </span>
            <span className="absolute inset-x-0 bottom-0 grid gap-0.5 bg-[linear-gradient(transparent,rgb(0_0_0/82%))] px-2 pt-5 pb-[7px] text-white">
              <strong className="truncate text-[12px] leading-4">
                <span>{shownName}</span> (você)
              </strong>
              <small className="text-[9px] leading-3 text-[rgb(255_255_255/76%)]">
                Na sala
              </small>
            </span>
          </span>
        </div>
      </SettingsGroup>
    </SettingsSection>
  );
}
