# Validação da versão 0.11.0

## Executado localmente

- `npm run typecheck`: aprovado.
- `npx vitest run`: 249 de 249 testes aprovados. O caso de `tests/audio-build-command.test.ts` que executava um compilador falso (`fake-cl.cmd`) foi removido: ele dependia de o `cmd` procurar comandos na pasta atual, o que não acontece em todas as máquinas, e não cobre a compilação real, que usa o `cl.exe` do PATH.
- `npm run build` (renderer e servidor): aprovado.
- `prettier --check` nos arquivos alterados: aprovado.
- Prévia do renderer no navegador (sem a ponte desktop): boas-vindas sem grupos, Início com grupos salvos, lateral com troca de grupo, menu da foto (Editar perfil e Configurações), menu "⋯" do grupo com Escape devolvendo o foco, diálogo "Adicionar grupo" com abas, "Novidades do Discorja" e perfil com o link do GIPHY. O console mostrou apenas a recusa de conexão com o servidor local, que não estava rodando.

Novos testes cobrem: aquecimento do servidor e negociação 5 → 4; decisão e listagem de novidades (incluindo a nota obrigatória da versão do `package.json`); manutenção do vídeo P2P em quedas curtas; identificação de imagens pelos bytes; cache de fotos; plano de quadros de GIF; convites, armazenamento e lobby de grupos; servidor com fotos por `avatarId`, `get-avatar`, grupos, limites, compatibilidade 4/5, `TRUST_PROXY_HOPS` e painel `/admin`.

## Não executado

- Os smoke tests em Electron (`smoke`, `rooms`, `multistream`, `audio`, `logs`, `accessibility`, `check-updater`) ainda criam salas com `[data-action=create]` e entram digitando `#room-code`, fluxos removidos na 0.11.0. Eles precisam ser reescritos para criar um grupo e entrar pela lista de salas antes de rodar de novo.

- `npm run test:accessibility` e demais smoke tests em Electron: o binário do Electron da versão instalada não estava baixado neste ambiente (o script tentou baixá-lo e excedeu o tempo).
- `npm run audio:build`: requer Visual Studio C++ Build Tools.
- Conversão real de GIF com `ImageDecoder` no app empacotado, servidor no Render (cold start, `TRUST_PROXY_HOPS=1`) e grupo entre computadores diferentes.

## Roteiro manual antes de publicar

1. Implantar o servidor e definir `TRUST_PROXY_HOPS=1` e `STATS_TOKEN`; abrir `/admin` e conferir os dados.
2. Abrir o app depois de 15 minutos sem uso e confirmar o aviso "Acordando o servidor…".
3. Escolher um GIF baixado do GIPHY no perfil e confirmar a animação para outra pessoa da sala; com "reduzir movimento" ativo no Windows, confirmar a imagem parada.
4. Criar um grupo, copiar o convite, entrar com outro app e entrar na sala listada com um clique.
5. Desligar o Wi-Fi por alguns segundos durante uma transmissão e confirmar que o vídeo continua após a retomada.
6. Atualizar de 0.10.1 e confirmar que "Novidades do Discorja" aparece uma vez.
