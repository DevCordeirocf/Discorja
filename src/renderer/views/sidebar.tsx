import { Icon } from '../ui/components/icon';
import { logoUrl, type AppPage } from './design';
import { MenuItem, PopoverMenu } from './menu';

export interface RailGroup {
  secret: string;
  name: string;
  initials: string;
  selected: boolean;
  live: boolean;
}

export interface SidebarProps {
  page: AppPage;
  hasRoom: boolean;
  groups: RailGroup[];
  canAddGroup: boolean;
  displayName: string;
  profilePhoto: string;
  version: string;
  profileMenuOpen: boolean;
}

const RAIL_BUTTON =
  'relative grid size-12 flex-none cursor-pointer place-items-center rounded-[16px] border [font:700_14px_var(--font-display)] transition-[border-color,background-color,color] duration-[140ms] motion-reduce:transition-none';
const RAIL_ACTIVE = 'border-2 border-purple bg-selected text-purple';
const RAIL_IDLE =
  'border-[#2b2c37] bg-control hover:border-control-hover hover:text-text';

const Divider = () => (
  <span
    className="h-0.5 w-8 flex-none rounded-[1px] bg-panel-line"
    aria-hidden="true"
  />
);

/** The person's photo, or the first letter of the name. */
function Avatar(props: { name: string; photo: string; className: string }) {
  // `avatar` keeps the shared border from the legacy room styles.
  return (
    <span
      className={`avatar grid place-items-center overflow-hidden rounded-[50%] bg-[#3a3150] text-[16px] font-medium text-[#d2c4ff] ${props.className}`}
    >
      {props.photo ? (
        <img className="size-full object-cover" src={props.photo} alt="" />
      ) : (
        props.name.charAt(0).toLocaleUpperCase('pt-BR') || '?'
      )}
    </span>
  );
}

/** The single side bar: logo, the room in use, the groups and the profile menu. */
export function Sidebar(props: SidebarProps) {
  const { page } = props;
  const name = props.displayName.trim();
  const profileLabel = `Perfil de ${name || 'você'}`;
  const inRoom = page === 'room';
  // `rail` and `profile-menu` stay as hooks for the smoke tests.
  return (
    <aside className="rail fixed inset-y-0 left-0 z-10 flex h-dvh w-[78px] flex-col items-center gap-3 border-r border-panel-line bg-[#121318] pt-[18px] pb-[14px]">
      <img
        className="size-11 rounded-[14px] object-contain"
        src={logoUrl}
        alt="Discorja"
        width="44"
        height="44"
      />
      <Divider />
      <nav
        id="main-navigation"
        className="flex min-h-0 w-full flex-[1_1_auto] flex-col items-center gap-3 overflow-y-auto py-0.5 [scrollbar-width:none]"
        aria-label="Seus grupos"
      >
        {props.hasRoom && (
          <button
            type="button"
            className={`${RAIL_BUTTON} ${inRoom ? RAIL_ACTIVE : `${RAIL_IDLE} text-mint`}`}
            data-action="room"
            aria-label="Voltar para a sala"
            title="Voltar para a sala"
            aria-current={inRoom ? 'page' : undefined}
          >
            <Icon name="screen" className="size-[22px]" />
          </button>
        )}
        {props.groups.map((group) => {
          const current = group.selected && page === 'home';
          return (
            <button
              key={group.secret}
              type="button"
              className={`${RAIL_BUTTON} ${current ? RAIL_ACTIVE : `${RAIL_IDLE} text-muted`}`}
              data-action="select-group"
              data-group={group.secret}
              aria-label={`${group.name}${group.live ? ', com tela ao vivo' : ''}`}
              title={group.name}
              aria-current={current ? 'page' : undefined}
            >
              {group.initials}
              {group.live && (
                <span
                  className="absolute -right-1 -bottom-1 size-[14px] rounded-[50%] border-[3px] border-[#121318] bg-[#3fbf8a]"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
        {props.canAddGroup && (
          <button
            type="button"
            className={`${RAIL_BUTTON} border-dashed border-control-hover bg-transparent text-muted hover:text-text`}
            data-action="add-group"
            aria-label="Criar ou entrar em um grupo"
            title="Criar ou entrar em um grupo"
          >
            <Icon name="plus" className="size-[22px]" />
          </button>
        )}
      </nav>
      {/* Outside `data-menu`, so clicking it still closes the profile menu. */}
      <button
        type="button"
        className={`${RAIL_BUTTON} ${RAIL_IDLE} text-muted`}
        data-action="open-bug-report"
        aria-label="Enviar relatório de erro"
        title="Enviar relatório de erro"
      >
        <Icon name="alert" className="size-[22px]" />
      </button>
      <div className="relative flex flex-col items-center gap-3" data-menu>
        <Divider />
        <button
          type="button"
          className={`size-12 cursor-pointer rounded-[50%] border-2 bg-transparent p-0 ${props.profileMenuOpen || page === 'settings' ? 'border-purple' : 'border-transparent hover:border-purple'}`}
          data-action="toggle-profile-menu"
          data-menu-toggle
          aria-haspopup="menu"
          aria-expanded={props.profileMenuOpen}
          aria-label={profileLabel}
          title={profileLabel}
        >
          <Avatar
            name={name}
            photo={props.profilePhoto}
            className="size-full"
          />
        </button>
        {props.profileMenuOpen && (
          <PopoverMenu
            label="Seu perfil"
            className="profile-menu bottom-0 left-[calc(100%+18px)] w-[260px]"
          >
            <div className="mb-1 flex items-center gap-3 border-b border-[#2b2c37] px-1.5 pt-1.5 pb-3">
              <Avatar
                name={name}
                photo={props.profilePhoto}
                className="size-11 flex-none"
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <strong className="truncate text-[15px]">
                  {name || 'Seu nome'}
                </strong>
                <small className="text-[12px] text-faint">
                  {/^\d/u.test(props.version)
                    ? `v${props.version}`
                    : props.version}
                </small>
              </span>
            </div>
            <MenuItem action="edit-name" icon="edit">
              Editar perfil
            </MenuItem>
            <MenuItem action="settings" icon="settings">
              Configurações
            </MenuItem>
          </PopoverMenu>
        )}
      </div>
    </aside>
  );
}
