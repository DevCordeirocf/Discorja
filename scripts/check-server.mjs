import { checkService } from '../dist/server/check.js';

try {
  const endpoint =
    process.argv[2] ||
    process.env.DISCORJA_SIGNALING_URL ||
    'ws://127.0.0.1:8787';
  const result = await checkService(endpoint, process.env.STATS_TOKEN);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} catch {
  console.error(
    'Falha no diagnóstico. Confira o endpoint WSS (WS apenas local), sem credenciais ou parâmetros, e STATS_TOKEN opcional no ambiente.',
  );
  process.exitCode = 1;
}
