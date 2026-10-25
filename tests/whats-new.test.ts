import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHANGELOG } from '../src/renderer/features/whats-new/changelog';
import {
  compareVersions,
  decideWhatsNew,
  entriesSince,
} from '../src/renderer/features/whats-new/whats-new';
import { renderWhatsNewModal } from '../src/renderer/views/whats-new';

const packageVersion: string = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;

describe('Novidades do Discorja', () => {
  it('tem uma nota para a versão atual do aplicativo', () => {
    expect(CHANGELOG[0].version).toBe(packageVersion);
  });

  it('mantém o histórico ordenado, único e curto', () => {
    const versions = CHANGELOG.map((entry) => entry.version);
    expect(new Set(versions).size).toBe(versions.length);
    for (let index = 1; index < versions.length; index++)
      expect(compareVersions(versions[index - 1], versions[index])).toBe(1);
    for (const entry of CHANGELOG) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.items.length).toBeGreaterThan(0);
      for (const item of entry.items) {
        expect(['novo', 'melhoria', 'correção']).toContain(item.kind);
        expect(item.text.length).toBeLessThanOrEqual(200);
      }
    }
  });

  it('compara versões numericamente', () => {
    expect(compareVersions('0.10.0', '0.9.12')).toBe(1);
    expect(compareVersions('0.9.12', '0.10.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('prévia', '1.0.0')).toBeNull();
  });

  it('mostra só para quem atualizou', () => {
    expect(
      decideWhatsNew({ current: '0.10.0', lastSeen: null, freshInstall: true }),
    ).toBe('mark-seen');
    expect(
      decideWhatsNew({
        current: '0.10.0',
        lastSeen: null,
        freshInstall: false,
      }),
    ).toBe('show');
    expect(
      decideWhatsNew({
        current: '0.10.0',
        lastSeen: '0.9.12',
        freshInstall: false,
      }),
    ).toBe('show');
    expect(
      decideWhatsNew({
        current: '0.10.0',
        lastSeen: '0.10.0',
        freshInstall: false,
      }),
    ).toBe('none');
    expect(
      decideWhatsNew({
        current: 'prévia',
        lastSeen: null,
        freshInstall: false,
      }),
    ).toBe('none');
  });

  it('lista as versões desde a última vista', () => {
    const log = [
      { version: '0.3.0', date: '2026-01-03', items: [] },
      { version: '0.2.0', date: '2026-01-02', items: [] },
      { version: '0.1.0', date: '2026-01-01', items: [] },
    ];
    expect(
      entriesSince(log, '0.3.0', '0.1.0').map((entry) => entry.version),
    ).toEqual(['0.3.0', '0.2.0']);
    expect(
      entriesSince(log, '0.2.0', null).map((entry) => entry.version),
    ).toEqual(['0.2.0', '0.1.0']);
  });

  it('escapa o texto e nomeia o diálogo', () => {
    const html = renderWhatsNewModal({
      version: '1.0.0',
      entries: [
        {
          version: '1.0.0',
          date: '2026-10-24',
          items: [{ kind: 'novo', text: '<b>Grupos</b>' }],
        },
      ],
    });
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-labelledby="whats-new-title"');
    expect(html).toContain('&lt;b&gt;Grupos&lt;/b&gt;');
    expect(html).toContain('>Novo</span>');
  });
});
