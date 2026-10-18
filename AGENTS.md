# Padrões do Discorja

Este arquivo orienta agentes e colaboradores ao alterar o Discorja. Preserve mudanças locais existentes e mantenha cada alteração focada no comportamento solicitado.

## Visão do sistema

- O Discorja é um aplicativo desktop Electron com TypeScript, voltado principalmente para Windows.
- A mídia de tela usa WebRTC ponto a ponto. O servidor WebSocket trata salas, presença e sinalização; ele não recebe nem retransmite vídeo.
- O protocolo compartilhado fica em `src/shared/`. Alterações no protocolo devem manter cliente e servidor compatíveis.
- A arquitetura detalhada e os fluxos de sala estão em `docs/arquitetura.md`; consulte também os documentos específicos em `docs/` antes de mudar implantação, áudio, qualidade ou releases.

## Limites entre componentes

- `src/electron/main.ts` é a fronteira privilegiada: janela, captura, atualizações e operações do sistema.
- `src/electron/preload.ts` deve expor somente métodos tipados e específicos. Não adicione acesso genérico a Node.js, shell ou arquivos.
- `src/renderer/app.ts` coordena estado e eventos. Coloque markup de páginas em `src/renderer/views/`, persistência em módulos próprios e mídia/sinalização em seus serviços dedicados.
- O renderer não deve importar módulos privilegiados do Electron nem receber segredos.
- `src/server/` valida e processa conexões externas. Mantenha validação, configuração e ciclo de vida separados; o servidor não deve depender do renderer ou do Electron.
- `src/renderer/app.css` agrega os estilos por área. Preserve a ordem de importação e os tokens visuais existentes ao dividir ou mover CSS.

## Segurança e privacidade

- Nunca inclua tokens, senhas, credenciais TURN, chaves privadas, certificados de assinatura ou conteúdo de `.env` no código, nos logs, em testes ou na documentação. `.env.example` pode conter somente nomes e valores fictícios.
- Antes de adicionar arquivos de configuração, confirme que não contêm dados locais ou segredos. Não leia nem reproduza valores de arquivos secretos em saídas de terminal.
- Preserve `contextIsolation`, `sandbox`, `nodeIntegration: false`, a política de conteúdo e a validação do remetente IPC. Qualquer operação nova entre renderer e processo principal precisa de método estreito, validação de entrada e teste.
- Valide formato, tamanho, papel e autorização de toda mensagem recebida pela sinalização. Não aceite encaminhamento arbitrário entre salas ou participantes.
- Logs e diagnósticos devem excluir nomes de convite, tokens, endpoint privado, SDP, candidatos ICE e conteúdo de mídia/tela. Registre estados e erros úteis sem despejar payloads.
- Não enfraqueça verificação de hash, assinatura configurada, validação TLS ou controles de origem para contornar falhas de build ou conexão.
- A captura deve começar somente após ação explícita do usuário. Preserve as restrições atuais de câmera e microfone e não acrescente gravação automática.

## Interface e experiência

- Mantenha a interface em português e siga os nomes e termos já usados no produto.
- Erros devem aparecer como notificações sobrepostas, sem deslocar o conteúdo ou causar saltos de rolagem.
- Preserve acessibilidade: foco visível, navegação por teclado, rótulos acessíveis, escape de conteúdo dinâmico e respeito a `prefers-reduced-motion`.
- Mantenha o player de vídeo estável durante atualizações de estado para evitar reinicializar a reprodução sem necessidade.

## Alterações e compatibilidade

- Prefira módulos pequenos com uma responsabilidade clara; não mova código apenas para reduzir o tamanho de um arquivo se isso criar acoplamento ou duplicação.
- Não altere limites, formatos persistidos, protocolo ou comportamento de releases sem atualizar os testes e a documentação correspondente.
- Qualidade e FPS configurados são metas sujeitas à captura, ao codificador, à máquina e à rede. Não prometa entrega garantida de quadros ou bitrate.
- Atualizações devem continuar sem token secreto embutido no aplicativo; assinatura pode ser opcional conforme a configuração de release, mas hash e validação dos artefatos continuam obrigatórios.
- Não adicione serviços pagos ou dependências de hospedagem paga sem solicitação explícita. Documente requisitos operacionais e limites das opções gratuitas.

## Verificação

- Para mudanças TypeScript, execute `npm run typecheck` e os testes Vitest relacionados (`npm test -- --run <arquivo>` quando aplicável).
- Para mudanças de UI, execute também `npm run build`; verifique os fluxos afetados e preserve a compatibilidade com os testes de smoke existentes.
- Execute `npm run format:check` nos arquivos alterados. Se houver problemas de formatação, formate somente os arquivos desta alteração.
- Mudanças no serviço devem incluir testes de validação, autorização e encerramento/limpeza, conforme o fluxo afetado.
- `npm run audio:build` requer um ambiente Windows com Visual Studio C++ Build Tools. Relate claramente quando não puder ser executado por falta desse ambiente.
- Não afirme que um teste passou sem executá-lo. Ao concluir, informe os comandos executados e quaisquer limitações relevantes.

## Git e arquivos locais

- Não adicione `.env`, configurações privadas, credenciais, chaves, certificados de assinatura, logs, dumps, instaladores nem saídas de build ao Git.
- O `.gitignore` não remove arquivos que já estejam rastreados. Verifique `git ls-files` antes de concluir que um segredo está protegido; se um arquivo sensível já for rastreado, sinalize isso e não exponha seu conteúdo.
- Não faça commit, push, publicação ou criação de release sem pedido explícito.
