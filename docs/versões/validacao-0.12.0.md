# Validação da versão 0.12.0

## Executado localmente

- `npm run typecheck`: aprovado.
- `npm test -- --run`: 266 de 266 testes aprovados.
- `npm run build` (renderer e servidor, incluindo a geração de `build/icon.ico` a partir da logo nova): aprovado.
- `npm run format:check`: aprovado.
- `node scripts/process-logo.mjs`: gera `src/renderer/assets/logo.png` (1024 × 1024) a partir de `assets/brand/discorja-logo.svg`. O brilho dos olhos da abertura foi conferido sobre a arte nova em uma captura renderizada.

Novos testes cobrem: opções de QPS 30, 60, 75, 90 e 120 com migração de 45 → 30 e 70 → 75 nas preferências salvas; lobby que acorda o servidor pelo próprio WebSocket (primeira tentativa de 20 s, novas tentativas a cada 2 s por até 90 s e depois o intervalo normal); aviso "Acordando o servidor…" quando a resposta demora; a tela de Configurações por seções, com perfil, alterações não salvas e navegação; e as fotos em "Online agora" (protocolo 6 só no lobby, recuo para o 5, validação das mensagens, entrega só a quem segue o grupo, limite de trocas e recusa de salas nessa conexão).

## Não executado

- Smoke tests em Electron (`smoke`, `rooms`, `multistream`, `audio`, `logs`, `accessibility`, `check-updater`): os seletores foram atualizados para os botões de resolução e QPS e para as seções de Configurações, mas não foram executados nesta preparação.
- `npm run audio:build`: requer Visual Studio C++ Build Tools.
- Servidor no Render dormindo de verdade (cold start) com o lobby novo.

## Roteiro manual antes de publicar

1. Instalar o app e conferir a logo nova no atalho, na barra de tarefas, na abertura (com o brilho nos olhos) e na lateral.
2. Abrir Configurações pela foto e pela engrenagem, percorrer as cinco seções com o teclado e voltar com "Voltar" e com Esc, dentro e fora de uma sala.
3. Mudar o nome em Configurações › Perfil, conferir a barra "Você tem alterações não salvas", usar "Descartar" e depois "Salvar alterações".
4. Em uma transmissão, trocar resolução e QPS pelos botões e conferir as medições; com uma preferência antiga de 45 ou 70 QPS salva, confirmar que o app abre com 30 ou 75.
5. Abrir o app depois de 15 minutos sem uso e confirmar o aviso "Acordando o servidor…" e a conexão do Início sem precisar reabrir.
6. Implantar o servidor 0.12 e conferir, com dois apps 0.12 no mesmo grupo, as fotos em "Online agora" (inclusive de quem está numa sala); com um app 0.11 no mesmo grupo, conferir que ele continua listando as salas.
7. Atualizar de 0.11.0 e confirmar que "Novidades do Discorja" aparece uma vez.
