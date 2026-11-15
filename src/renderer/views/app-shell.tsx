import type { ReactNode } from 'react';
import { Icon } from '../ui/components/icon';
import type { AppPage } from './design';

type Notice = { text: string; kind: 'error' | 'info' | 'success' };

const NOTICE_ICONS: Record<Notice['kind'], string> = {
  error: 'alert',
  success: 'check',
  info: 'network',
};

export interface AppShellProps {
  page: AppPage;
  hasDesktopApi: boolean;
  notice: Notice | null;
  sidebar: ReactNode;
  home: ReactNode;
  /** Rendered only on the settings page. */
  settings: ReactNode;
  room: ReactNode;
  modal: ReactNode;
}

export function AppShell(props: AppShellProps) {
  // Configurações takes the whole window: no group rail, its own navigation.
  const rail = props.page !== 'settings';
  const { notice } = props;
  return (
    <>
      <div className={`app-shell ${rail ? 'has-rail' : 'no-rail'}`}>
        <a className="skip-link" href="#main-content">
          Ir para o conteúdo
        </a>
        {rail && props.sidebar}
        <div className="main-shell">
          <main
            id="main-content"
            className={`app-main ${props.page}-main`}
            tabIndex={-1}
          >
            {!props.hasDesktopApi && (
              <div className="preview-notice">
                Prévia da interface. Abra o aplicativo desktop para compartilhar
                sua tela.
              </div>
            )}
            {notice && (
              <div
                className={`notice ${notice.kind}`}
                role={notice.kind === 'error' ? 'alert' : 'status'}
                aria-live={notice.kind === 'error' ? 'assertive' : 'polite'}
              >
                <Icon name={NOTICE_ICONS[notice.kind]} />
                <span>{notice.text}</span>
                {notice.kind === 'error' && props.hasDesktopApi && (
                  <button
                    type="button"
                    className="button subtle ml-auto flex-none px-2.5 py-1.5 text-[11px] whitespace-nowrap"
                    data-action="open-bug-report"
                  >
                    Enviar relatório por e-mail
                  </button>
                )}
                <button
                  className="icon-button"
                  data-action="dismiss"
                  aria-label="Dispensar aviso"
                >
                  <Icon name="close" />
                </button>
              </div>
            )}
            <section className="home-page" hidden={props.page !== 'home'}>
              {props.home}
            </section>
            {props.page === 'settings' && props.settings}
            <section id="room-view" hidden={props.page !== 'room'}>
              {props.room}
            </section>
          </main>
        </div>
      </div>
      {props.modal}
    </>
  );
}
