/**
 * Static operator page. It carries no data: the browser asks for the token,
 * keeps it only in sessionStorage and reads /api/admin with a Bearer header.
 * Every value is written with textContent, never as HTML.
 */
export function adminPage(nonce: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Discorja · Painel</title>
<style nonce="${nonce}">
:root{color-scheme:dark;--bg:#101115;--surface:#191a20;--line:#343541;--text:#eeedf4;--muted:#b0afc0;--purple:#b8a0ff;--mint:#a6dfc8;--red:#ff8a8a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 'Segoe UI',system-ui,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px}h1{font-size:20px;margin:0 0 16px}h2{font-size:15px;margin:24px 0 10px}
form{display:flex;gap:8px;flex-wrap:wrap}input{flex:1;min-width:220px;padding:10px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--text)}
button{padding:10px 14px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--text);cursor:pointer}button:focus-visible,input:focus-visible{outline:2px solid var(--purple);outline-offset:2px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px}
.card b{display:block;font-size:22px}.card span{color:var(--muted);font-size:12px}
table{width:100%;border-collapse:collapse;background:var(--surface);border-radius:10px;overflow:hidden}th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--muted);font-weight:600;font-size:12px}
.wrap{overflow-x:auto}.muted{color:var(--muted)}.error{color:var(--red)}.tag{display:inline-block;margin:0 4px 4px 0;padding:1px 8px;border:1px solid var(--line);border-radius:999px;font-size:12px}
.tag.live{border-color:var(--mint);color:var(--mint)}.tag.off{opacity:.6}[hidden]{display:none!important}
</style>
</head>
<body>
<main>
<h1>Discorja · Painel do servidor</h1>
<form id="login"><label for="token" class="muted">Token de acesso</label><input id="token" type="password" autocomplete="off" required><button type="submit">Entrar</button></form>
<p id="status" class="muted" role="status"></p>
<section id="panel" hidden>
<div class="cards" id="cards"></div>
<h2>Salas ativas</h2><div class="wrap"><table><thead><tr><th>Sala</th><th>Código</th><th>Protocolo</th><th>Aberta há</th><th>Participantes</th></tr></thead><tbody id="rooms"></tbody></table></div>
<h2>Grupos ativos</h2><div class="wrap"><table><thead><tr><th>#</th><th>Pessoas acompanhando</th><th>Salas abertas</th></tr></thead><tbody id="groups"></tbody></table></div>
<p><button id="logout" type="button">Sair</button></p>
</section>
</main>
<script nonce="${nonce}">
(() => {
  const $ = (id) => document.getElementById(id);
  let timer;
  const read = () => { try { return sessionStorage.getItem('discorja.admin-token') || ''; } catch { return ''; } };
  const store = (value) => { try { value ? sessionStorage.setItem('discorja.admin-token', value) : sessionStorage.removeItem('discorja.admin-token'); } catch {} };
  const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = String(text); if (className) node.className = className; return node; };
  const duration = (ms) => { const m = Math.floor(ms / 60000); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; };
  const card = (value, label) => { const box = el('div', undefined, 'card'); box.append(el('b', value), el('span', label)); return box; };
  function render(data) {
    $('cards').replaceChildren(
      card(data.connections, 'conexões agora'),
      card(data.peakConnections, 'pico de conexões'),
      card(data.rooms.length + ' / ' + data.limits.maxRooms, 'salas ativas'),
      card(data.participants, 'pessoas em salas'),
      card(data.lobby, 'fora de sala (grupos)'),
      card(data.totals.roomsCreated, 'salas criadas'),
      card(data.totals.joins, 'entradas em salas'),
      card(duration(data.uptimeMs), 'servidor ligado'),
    );
    const rooms = data.rooms.map((room) => {
      const row = el('tr');
      const people = el('td');
      for (const person of room.participants) {
        const label = person.name + (person.role === 'owner' ? ' · dono' : person.role === 'moderator' ? ' · moderador' : '') + (person.sharing ? ' · transmitindo' : '');
        people.append(el('span', label, 'tag' + (person.sharing ? ' live' : '') + (person.connected ? '' : ' off')));
      }
      row.append(el('td', room.name + (room.inGroup ? ' (grupo)' : '')), el('td', room.code), el('td', room.protocol), el('td', duration(room.ageMs)), people);
      return row;
    });
    if (!rooms.length) { const row = el('tr'); const cell = el('td', 'Nenhuma sala aberta.', 'muted'); cell.colSpan = 5; row.append(cell); rooms.push(row); }
    $('rooms').replaceChildren(...rooms);
    const groups = data.groups.map((group, index) => { const row = el('tr'); row.append(el('td', index + 1), el('td', group.subscribers), el('td', group.rooms)); return row; });
    if (!groups.length) { const row = el('tr'); const cell = el('td', 'Nenhum grupo ativo.', 'muted'); cell.colSpan = 3; row.append(cell); groups.push(row); }
    $('groups').replaceChildren(...groups);
    $('status').textContent = 'Atualizado às ' + new Date(data.generatedAt).toLocaleTimeString('pt-BR') + '. Atualiza a cada 10 s.';
  }
  async function load() {
    const token = read();
    if (!token) return;
    clearTimeout(timer);
    try {
      const response = await fetch('/api/admin', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
      if (response.status === 401) { store(''); show(false); $('status').textContent = 'Token inválido.'; $('status').className = 'error'; return; }
      if (!response.ok) throw new Error(String(response.status));
      $('status').className = 'muted';
      render(await response.json());
      show(true);
    } catch (error) {
      $('status').textContent = 'Não foi possível ler os dados (' + (error instanceof Error ? error.message : 'erro') + '). Tentando de novo…';
      $('status').className = 'error';
    }
    timer = setTimeout(load, 10000);
  }
  function show(logged) { $('panel').hidden = !logged; $('login').hidden = logged; }
  $('login').addEventListener('submit', (event) => { event.preventDefault(); store($('token').value.trim()); $('token').value = ''; void load(); });
  $('logout').addEventListener('click', () => { store(''); clearTimeout(timer); show(false); $('status').textContent = ''; });
  show(false);
  void load();
})();
</script>
</body>
</html>`;
}
