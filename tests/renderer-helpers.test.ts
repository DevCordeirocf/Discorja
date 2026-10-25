import { describe, expect, it, vi } from 'vitest';
import { escapeHtml } from '../src/renderer/ui/components/html';
import { icon } from '../src/renderer/ui/components/icons';
import { createNotifier } from '../src/renderer/ui/feedback/notifications';
import { pickAutoModal } from '../src/renderer/ui/application/auto-modal';

describe('utilitários de templates do renderer', () => {
  it('escapa caracteres HTML de texto não confiável', () => {
    expect(escapeHtml(`<script a="b">'&</script>`)).toBe(
      '&lt;script a=&quot;b&quot;&gt;&#39;&amp;&lt;/script&gt;',
    );
  });

  it('renderiza ícones conhecidos e usa um fallback para nomes desconhecidos', () => {
    expect(icon('volume-muted')).toContain('aria-hidden="true"');
    expect(icon('missing')).toContain('<rect x="3" y="4"');
  });

  it('remove avisos temporários somente quando pedido', () => {
    vi.useFakeTimers();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let notice: unknown = null;
    const notify = createNotifier({
      getTimer: () => timer,
      setTimer: (value) => (timer = value),
      setNotice: (value) => (notice = value),
      render: () => undefined,
    });
    notify('Fixo', 'error');
    vi.advanceTimersByTime(5_000);
    expect(notice).toEqual({ text: 'Fixo', kind: 'error' });
    notify('Salvo', 'success', true);
    vi.advanceTimersByTime(5_000);
    expect(notice).toBeNull();
    vi.useRealTimers();
  });

  it('abre o aviso de atualização sozinho apenas quando nada mais está aberto', () => {
    const base = {
      loaded: true,
      modal: null,
      busy: null,
      update: { status: 'available' as const, version: '1.0.0' },
      updateDismissed: false,
      updatePrompted: false,
      whatsNewPending: false,
      page: 'home' as const,
      hasRoom: false,
    };
    expect(pickAutoModal(base)).toBe('update');
    expect(pickAutoModal({ ...base, whatsNewPending: true })).toBe('update');
    const calm = { ...base, update: { status: 'current' as const } };
    expect(pickAutoModal({ ...calm, whatsNewPending: true })).toBe('whats-new');
    expect(
      pickAutoModal({ ...calm, whatsNewPending: true, hasRoom: true }),
    ).toBeNull();
    expect(pickAutoModal({ ...base, modal: 'profile' })).toBeNull();
    expect(pickAutoModal({ ...base, busy: 'room' })).toBeNull();
    expect(pickAutoModal({ ...base, updatePrompted: true })).toBeNull();
    expect(
      pickAutoModal({ ...base, update: { status: 'checking' } }),
    ).toBeNull();
  });
});
