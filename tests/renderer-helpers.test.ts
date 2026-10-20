import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../src/renderer/ui/components/html';
import { icon } from '../src/renderer/ui/components/icons';

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
});
