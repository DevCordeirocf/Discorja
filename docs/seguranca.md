# Segurança e operação sem serviços pagos

## Protocolo 5, grupos e painel — 0.11.0

- **Fotos:** o tipo é conferido pelos bytes iniciais (JPEG, GIF, WebP) no app e no servidor, e GIF/WebP acima de 256 × 256 px são recusados, limitando o custo de decodificação. O servidor calcula o `avatarId`; o app só usa a imagem se o hash conferir. A CSP do renderer passou a aceitar `img-src blob:` para exibir as fotos guardadas em memória; scripts continuam restritos a `'self'`. A conversão de GIF usa `gifenc` (MIT, sem dependências), empacotado no renderer.
- **Grupos:** o convite contém um segredo de 128 bits que nunca sai do app; o servidor recebe apenas o SHA-256 dele e só envia a listagem a quem apresentar a mesma chave. Quem tiver o convite vê salas e códigos do grupo; não há revogação além de criar um novo grupo. Chaves, convites e nomes não entram nos logs. Copiar o convite usa o IPC estreito `group:copy-invite`, que valida o formato antes de escrever na área de transferência.
- **Links externos:** a janela abre no navegador somente páginas exatas da lista (`https://github.com/DevCordeiroCf` e `https://giphy.com/`), sem parâmetros.
- **Painel `/admin`:** página estática com CSP `default-src 'none'` e nonce, `X-Frame-Options: DENY` e `no-store`; os dados vêm de `/api/admin`, autenticada com o mesmo `STATS_TOKEN` (hash + comparação em tempo constante e 30 consultas/min por IP). Códigos de sala são mascarados e nenhum token é exposto. Proteja o token como uma senha.
- **Proxy:** `TRUST_PROXY_HOPS=1` usa somente a última entrada de `X-Forwarded-For`.
- **Colar com o botão direito:** o processo principal trata o evento `context-menu` e chama `webContents.paste()` somente quando o ponto clicado é um campo editável, há algo para colar e o campo não é de senha. O texto vai direto da área de transferência para o campo, sem IPC novo e sem passar pelo código do renderer.

## Consolidação 0.8.0

O diagnóstico schema 2 permite apenas estados, contagens, métricas numéricas e versões previstas. O processo principal fornece o runtime; nomes, tokens, endpoint, dados brutos de ICE/SDP e conteúdo não são exportados. Testes tentam inserir esses campos e verificam seu descarte. O teto de vídeo é limitado de 1 a 100 Mbps por espectador e continua sujeito ao orçamento total; não altera permissões de captura ou papéis.

O workflow de distribuição confere versão, nomes de arquivos, tamanho, SHA-512 e blockmap antes de selecionar os artefatos enviados. Rejeita manifesto incompatível e caminhos externos. A assinatura de código permanece opcional; quando configurada, sua validação continua obrigatória. Testes locais do atualizador usam um provedor de fixtures e não executam o instalador baixado.

A navegação acessível não amplia a ponte IPC. Modais mantêm o fundo inativo, menus continuam sujeitos à autorização do servidor e a atualização da lista de janelas não inicia captura. A homologação do host, contas, cotas e duas instalações reais segue separada dos testes locais, conforme [operacao.md](operacao.md).

## Publicações simultâneas e proteção de recursos — 0.7.0

No protocolo 3, a sinalização associa cada ID de publicação a um membro da sala e cada participante a no máximo uma seleção. SDP/ICE só é encaminhado entre publicador e assinante autorizado, com formato, tamanho e frequência limitados. Autoassinatura, IDs obsoletos, sinalização entre salas e ofertas de quem apenas assiste são rejeitados. Parar uma tela remove sua seleção nos receptores e os contadores de negociação correspondentes.

O limite padrão é duas publicações e dez participantes. O aplicativo não decodifica os demais cartões; trocar de tela encerra a recepção anterior. Snapshots recebidos do servidor são validados antes de gerar a interface, incluindo unicidade, vínculos entre IDs, limites e papéis. Nomes continuam escapados como texto. A pausa da prévia não altera a autorização da captura nem expõe APIs de janela ao renderer: a ponte recebe somente um estado booleano de primeiro plano.

Dono/moderador podem interromper uma publicação individual; a autoridade é verificada no servidor. O participante não pode encerrar a tela de outro ou inventar papel. Captura continua exigindo escolha e consentimento locais. O som recebido pelo Discorja fica bloqueado enquanto houver captura de áudio do computador para evitar recaptura; isso não isola vozes do Discord.

O novo diagnóstico `server:check` confirma saúde, protocolo e estatísticas opcionais sem criar salas, iniciar mídia ou imprimir segredos. Não segue redirecionamentos, não ignora TLS e limita mensagens e respostas. É uma ferramenta administrativa de operação, sem varredura ou exploração do host; consulte [operacao.md](operacao.md). A segurança do Windows, proxy e conta da hospedagem ainda depende das verificações no ambiente real.

## Permissões e troca de salas na 0.5.0

O protocolo de salas é confirmado antes da sessão. O servidor mantém dono, moderação e transmissor separadamente e verifica autorização em cada operação. Não aceita escolher um participante de outra sala, ofertas de um receptor, remoção do dono por moderador ou concessão de moderação pelo próprio participante. Sessões retomadas herdam somente o estado guardado no backend e recebem um token novo. Snapshots são validados no cliente, com limites de participantes, IDs únicos e dono/transmissor presentes na sala.

Trocar de sala fecha a mídia e a sinalização anteriores. O histórico guarda somente até doze convites/nome/endpoint, sem token de retomada. Abrir o painel não se conecta aos outros convites. Ser autorizado a transmitir nunca inicia captura remota. A saída do dono fecha a sala; publicação e moderação não transferem propriedade automaticamente. Procedimento de migração em [salas.md](salas.md).

**Referência:** revisão inicial da versão 0.2.4 e implementação local da 0.3.0, em 15 de outubro de 2026.  
**Escopo:** componentes Electron, sinalização, configuração e distribuição; consulta de avisos de dependências e testes locais. Não foi realizado teste de invasão, varredura do servidor publicado ou inspeção da conta de hospedagem. Os controles implementados e as verificações operacionais pendentes estão discriminados na [validação da 0.3.0](versões/validacao-0.3.0.md).

## Objetivo e limites

Proteger o computador dos participantes, o processo do servidor e a distribuição do aplicativo contra execução de código indevida, acesso a arquivos, roubo de credenciais e abuso de recursos. Usar melhorias no código e ferramentas gratuitas, sem exigir certificado comercial, domínio, VPS, banco gerenciado, monitoramento pago ou serviço de segurança contratado.

**Decisão de produto:** os participantes entendem que estão compartilhando conteúdo. Prints e gravações pelos espectadores são aceitos. Não implementar bloqueio de captura, DRM, controle de cópias ou exigências adicionais de sigilo da transmissão. Aprovação manual de entrada, sala travada e rotação de convite não são requisitos da próxima entrega.

O foco é impedir que entrar em uma sala ou receber uma transmissão dê a alguém acesso ao Windows, aos arquivos ou aos comandos do computador. Participantes e servidores de sinalização devem ser tratados como fontes de dados não confiáveis, mesmo em um grupo de amigos. Não existe garantia de segurança total; o objetivo é reduzir riscos verificáveis e testar cada controle.

O grupo usa o Discord para voz. Microfone e câmera continuam negados no Discorja. Ao adicionar áudio do computador, validar que a configuração anunciada como isolada não retransmite a chamada do Discord.

Na implementação 0.4.0, áudio do computador exige escolha e confirmação em cada captura. A autorização expira em quinze segundos, é consumida uma única vez e pode ser revogada durante a consulta da fonte. Permissões de mídia de dispositivo continuam negadas mesmo com uma seleção de tela pendente. Cancelar/fechar o app e encerrar a sala liberam as tracks. A prévia fica silenciada, e a recepção começa sem som. O loopback não exclui automaticamente Discord ou outros processos; as limitações estão em [audio.md](audio.md). Os hooks de áudio dos testes ficam em `scripts/fixtures/` e não fazem parte dos arquivos empacotados.

## Proteções observadas no código

| Área                   | Evidência                                                                                                                 | Limite da proteção                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Electron               | `src/electron/main.ts`: sandbox, isolamento de contexto, Node desabilitado na interface e segurança de origem habilitada. | Deve continuar assim ao adicionar SDKs e áudio.                                                                            |
| Interface privilegiada | IPC verifica janela, frame principal e origem confiável antes de executar operações.                                      | Cada operação também precisa validar seus argumentos e o estado permitido.                                                 |
| Captura                | Seleção válida por 15 segundos, consumida uma única vez; exige gesto do usuário e frame confiável.                        | O conteúdo da janela selecionada pode mudar; a pessoa precisa controlar o que compartilha.                                 |
| Navegação e arquivos   | Novas janelas, webviews e downloads comuns bloqueados; protocolo local limita arquivos ao diretório da interface.         | Preservar os bloqueios e testar caminhos malformados em futuras alterações.                                                |
| Política de conteúdo   | `src/renderer/index.html` define CSP, sem scripts remotos e sem objetos incorporados.                                     | A política permite conexões WSS a diferentes servidores; endereço configurável deve ser tratado como decisão de confiança. |
| Transporte             | Configuração permite WSS remoto; WS simples somente em localhost/127.0.0.1.                                               | Servidor HTTP local precisa de terminação TLS para publicação. Não desabilitar verificação de certificados.                |
| Sinalização            | Mensagens têm formato e campos validados, payload limitado a 128 KiB e autorização por sala/papel.                        | O aplicativo também valida as respostas recebidas antes de usá-las.                                                        |
| Abuso                  | Limites por socket/IP, salas/clientes limitados, heartbeat e proteção contra fila de envio crescente.                     | Não impedem ataque distribuído ou saturação do link; proxy pode alterar a visão de IP.                                     |
| Convites               | Código de oito caracteres gerado com aleatoriedade criptográfica; sala expira, por padrão, após quatro horas.             | Conhecer o código permite solicitar entrada sem comprovar identidade.                                                      |
| Releases               | Workflow publica rascunho; token de escrita restrito ao job de release; hash de atualização é verificado pelo updater.    | Sem assinatura independente, comprometimento do canal de publicação continua sendo risco relevante.                        |
| Segredos locais        | `.gitignore` exclui `.env`, chaves e certificados.                                                                        | Não remove segredos já versionados e não detecta todos os formatos de credenciais.                                         |

Esses controles são compatíveis com as recomendações de [segurança do Electron](https://www.electronjs.org/docs/latest/tutorial/security) e da [OWASP para WebSockets](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html). Não significam conformidade integral ou certificação.

## Controles da entrega 0.3.0

Isolamento, validação de mensagens, limites, retomada autenticada e estatísticas foram implementados e testados localmente. As listas abaixo descrevem também critérios de manutenção e conferência na implantação; não significam que permissões do host ou configurações das contas tenham sido verificadas. Aprovação de entrada e bloqueios de cópia continuam fora da prioridade.

### P0 — Impedir que dados remotos alcancem o sistema operacional

- Preservar sandbox, isolamento de contexto, Node desabilitado na interface e bloqueios de navegação. Não carregar páginas, scripts ou plugins enviados por participantes ou pelo servidor.
- Manter o preload com operações explícitas e pequenas. Não expor `ipcRenderer` inteiro, execução de comandos, acesso genérico a arquivos ou abertura arbitrária de programas.
- Em cada operação IPC, conferir origem/frame, argumentos, limites e estado permitido; dados de rede nunca podem escolher caminhos de arquivos, executáveis ou comandos.
- Testar acesso fora do diretório permitido pelo protocolo `app://`, caminhos codificados e solicitações IPC vindas de frames não autorizados.
- Rodar aplicativo e servidor sem privilégios administrativos. Evitar permissões amplas em diretórios de configuração e segredos.
- Manter Electron/Chromium e bibliotecas atualizados com versões corrigidas e testes de compatibilidade: falhas no processamento de mídia também podem afetar a máquina, independentemente de sigilo do conteúdo.

**Aceite:** nomes, mensagens, SDP, candidatos ICE e respostas de um servidor adulterado não executam scripts/comandos nem leem ou escrevem arquivos fora das operações locais previstas. Chamadas IPC não autorizadas e caminhos fora do diretório permitido são recusados. Esses testes cobrem casos definidos; não certificam ausência de toda vulnerabilidade.

### Controles simples de sala e melhorias opcionais

**Observado:** em `src/server/server.ts`, `join-room` adiciona o espectador à sala ao receber código válido, enquanto houver vaga. Não há aprovação do anfitrião. O comando `kick` remove o vínculo atual, mas não invalida o código nem registra bloqueio de retorno. A pessoa removida pode tentar entrar novamente.

Esse comportamento de convite não é, por si só, acesso ao computador. Manter as verificações de papel e vínculo com a sala e o encerramento do peer ao remover um participante. Isolar as salas também evita interferência e consumo indevido de recursos.

**Fora da prioridade atual:** aprovação manual, bloqueio de retorno, sala travada e rotação de convite. Só adicionar se houver necessidade de moderação. O código de sala continua funcionando como convite compartilhável; o sistema não promete identidade verificada ou banimento permanente de uma pessoa.

**Aceite do controle básico:** comandos administrativos de espectadores ou de outra sala são recusados; remoção fecha o peer atual; uma sessão não pode assumir o papel de anfitrião por informar outro ID. Uma futura retomada de sessão precisa validar o papel no servidor, sem confiar no estado enviado pelo cliente.

### P0 — Limites e validação nos dois lados

**Observado:** servidor valida tamanho e campos de mensagens. `src/renderer/transport/signal.ts` verifica principalmente tipos; não impõe limites equivalentes para strings, SDP e candidatos, nem tamanho antes de `JSON.parse`.

**Proposta:** limitar frame recebido antes do parse; rejeitar estruturas e campos inesperados; limitar nomes, IDs, SDP e ICE; validar números e estados; limitar candidatos e negociações por peer. Encerrar conexões que insistam em mensagens inválidas, sem derrubar o app.

Nomes e textos remotos devem continuar escapados antes de entrar em HTML. Testar nomes com marcação e atributos maliciosos. Não introduzir HTML remoto para mostrar mensagens de erro.

**Aceite:** mensagens grandes, binárias ou malformadas não criam consumo crescente nem execução de conteúdo; uma sessão não sinaliza mídia com alguém de outra sala; permissões são conferidas no servidor a cada operação relevante.

### P0 — Hospedagem, TLS e proxy

- Publicar somente por WSS/HTTPS, usando TLS gratuito fornecido pela hospedagem quando aplicável. TLS do servidor e assinatura Authenticode do instalador são coisas diferentes: dispensar assinatura comercial não dispensa transporte seguro.
- Em produção, definir `ALLOWED_ORIGINS=app://discorja`; incluir origens locais de desenvolvimento apenas no ambiente de desenvolvimento. Essa configuração já existe.
- Não tratar `Origin` como senha: clientes fora do navegador podem forjar esse cabeçalho. Verificações de papel e sessão continuam necessárias; ações administrativas exigem autorização própria.
- O servidor usa `request.socket.remoteAddress` e ignora cabeçalhos encaminhados. Isso evita confiar em IP informado por qualquer cliente, mas pode agrupar usuários atrás do proxy da hospedagem. Verificar o comportamento real antes de mudar a implementação.
- Se houver suporte a proxy confiável, aceitar cabeçalhos de IP somente de um caminho de rede/proxy comprovadamente confiável e normalizar a cadeia corretamente. Quando isso não puder ser garantido, preservar o endereço do socket e ajustar os limites de grupo; não aceitar `X-Forwarded-For` indiscriminadamente.
- Reduzir `MAX_CLIENTS` e `MAX_ROOMS` para o uso real, por exemplo 20 e 5 no piloto, após testes. Os padrões atuais de 5000 e 1000 não são recomendação de capacidade do plano gratuito.
- Em máquina própria, usar conta sem privilégios administrativos e firewall restrito aos serviços necessários. Não expor painel administrativo, banco ou portas de desenvolvimento.

**Aceite:** TLS inválido é recusado; origem não permitida é rejeitada; falsificação de cabeçalho não contorna limites; vários amigos atrás do mesmo IP/proxy conseguem usar o limite planejado sem abertura irrestrita a abuso.

### P0 — Proteção do servidor e contenção de invasão

**Ameaças consideradas:** explorar uma rota HTTP, o handshake WebSocket, uma mensagem malformada, uma dependência vulnerável ou credencial vazada para executar código no servidor. Depois, tentar acessar outros serviços da máquina/rede, roubar segredos ou usar a sinalização para atacar os computadores conectados. O servidor precisa ser protegido independentemente da permissão dos usuários para compartilhar conteúdo.

**Prevenção no backend:**

- Manter rotas explícitas e pequenas, validação antes de processar mensagens, timeouts e limites globais/per conexão. Não aceitar comandos, módulos, caminhos de arquivo ou código fornecidos pelo cliente.
- Não criar endpoints de terminal, execução remota ou upload de executáveis. Não adicionar `eval`, execução de shell ou carregamento dinâmico baseado em mensagens da sala.
- Se surgir um recurso de buscar URLs, validar destinos e bloquear acesso a serviços internos e metadados da hospedagem; não transformar o backend em proxy aberto. O recurso não faz parte do escopo atual.
- Atualizar Node.js e dependências com correções compatíveis; revisar também alterações no ambiente de implantação. Publicar o artefato de produção, sem servidor Vite, modo de inspeção remoto ou ferramentas de desenvolvimento expostas.
- Proteger a conta da hospedagem com autenticação forte e limitar quem pode implantar, ler segredos ou alterar variáveis de ambiente.

**Conter o impacto se uma falha for explorada:**

- Executar como usuário dedicado sem administrador/root, com acesso somente aos arquivos necessários ao serviço. Em máquina própria, separar dos documentos pessoais e de outros serviços; usar isolamento de processo/container quando viável, sem tratá-lo como proteção absoluta.
- Manter arquivos do programa sem permissão de escrita para o processo quando o ambiente permitir, concedendo escrita apenas ao diretório estritamente necessário. O backend atual não precisa receber arquivos nem guardar conteúdo transmitido.
- Restringir portas e acesso à rede interna conforme os controles disponíveis no ambiente. Não montar pastas pessoais, socket de administração de containers ou credenciais do computador no processo da aplicação.
- Guardar somente segredos indispensáveis à sinalização. Não colocar token de publicação do GitHub, chave de assinatura de releases ou acesso administrativo da hospedagem no servidor em execução.
- Preservar a separação entre sinalização e updater. Mesmo um servidor tomado não pode escolher instaladores, origem de atualização, comandos ou caminhos de arquivo no app.
- Registrar falhas e eventos de abuso sem credenciais e limitar tamanho/retenção dos logs para evitar esgotamento de disco. Usar recursos locais ou gratuitos já disponíveis.

**Resposta a incidente:** parar/isolar a instância suspeita, revogar segredos afetados, preservar registros necessários e reconstruir a partir de código/artefato confiável com a falha corrigida. Reiniciar o mesmo processo sem investigação não resolve um comprometimento. Em máquina própria, investigar também o sistema hospedeiro e outros acessos possíveis.

**Aceite:** em ambiente de teste próprio, entradas HTTP/WS malformadas não executam comandos nem acessam arquivos; o usuário do serviço não consegue alterar arquivos protegidos ou acessar diretórios pessoais; somente portas previstas ficam acessíveis. Confirmar ausência de credenciais de publicação na instância e simular servidor de sinalização malicioso contra o app. Verificar que mensagens dele não acionam instalação, execução, navegação remota ou acesso arbitrário a arquivos. Registrar controles que a hospedagem gratuita não permita configurar, sem afirmar que estão ativos.

### P0 — Proteger a futura rota de estatísticas

Aplicar a especificação de `GET /api/stats` do [plano de evolução](plano-de-atualizacoes.md). Deixar desabilitada enquanto a credencial administrativa não estiver configurada; usar `Authorization: Bearer`, segredo de alta entropia no ambiente do servidor e comparação adequada. Nunca incluir o segredo no app distribuído ou na URL.

Retornar apenas contadores agregados, sem códigos, nomes, IPs ou lista de salas; usar `Cache-Control: no-store`, limite de consultas e respostas sem detalhes internos. Não habilitar CORS amplo; CORS não substitui autenticação. Caso exista painel no navegador, seu backend guarda a credencial administrativa.

**Aceite:** sem token ou com token inválido, nenhuma estatística é exposta; erros não revelam credenciais; limite de consultas funciona; o conteúdo agregado permanece correto no ciclo de vida das conexões.

## Dependências: resultado da consulta

Foram executados `npm audit --json` e `npm audit --omit=dev --json` antes e depois da alteração da subetapa 0.3-A:

| Consulta                 | Antes da correção                                       | Após a correção e `npm ci`          |
| ------------------------ | ------------------------------------------------------- | ----------------------------------- |
| Todas as dependências    | Oito pacotes com alerta moderado; zero alto ou crítico. | Zero alertas conhecidos retornados. |
| Dependências de produção | Zero alertas conhecidos retornados.                     | Zero alertas conhecidos retornados. |

Os oito resultados são propagação na cadeia de empacotamento `electron-builder` → `app-builder-lib` → `@electron/get` → `global-agent` → `roarr` → `sprintf-js`, incluindo componentes associados de empacotamento. Não são oito falhas independentes comprovadas no aplicativo. O aviso raiz consultado é [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c), sobre negação de serviço por especificadores de precisão sem limite em `sprintf-js`.

### Correção aplicada na 0.3-A

O aviso de `sprintf-js` não informa uma versão corrigida publicada. A sugestão automática do audit era rebaixar `electron-builder` para 26.5.0. Foi mantido o empacotador 26.15.3 e aplicado um override **somente em `@electron/get@3.1.0`**, substituindo sua dependência opcional `global-agent` por **4.1.3**. Essa versão não depende de `roarr`/`sprintf-js`, removendo a cadeia vulnerável do lockfile sem ocultar alertas nem desabilitar a verificação de integridade.

A escolha atravessa uma versão principal do componente de proxy. Por isso, `tests/packaging-download.test.ts` resolve o downloader efetivamente usado por `app-builder-lib` e verifica, em processo isolado, download por proxy HTTP local, exclusão de proxy/conexão direta e rejeição de checksum incorreto. Os testes não acessam serviços externos; o domínio `.invalid` só é usado como destino interceptado pelo proxy local. Não foi validado um proxy corporativo HTTPS com autenticação.

`package.json` e `package-lock.json` registram a substituição; uma instalação limpa com `npm ci` reproduziu a árvore sem alertas. Os 74 testes e a verificação de tipos passaram. A validação de empacotamento e os limites do ensaio estão registrados no [progresso da 0.3-A](plano-de-atualizacoes.md#entrega-03-a--dependências-e-empacotamento).

**Manutenção:** reavaliar este override quando o empacotador atualizar seu downloader ou quando houver correção oficial compatível. Não remover a substituição enquanto isso reintroduzir a cadeia vulnerável; repetir os testes de download e empacotamento ao mudá-la.

Zero alertas conhecidos em produção não prova ausência de falhas. O audit não substitui acompanhamento de correções de Electron/Chromium, revisão de código nem análise da superfície do instalador. A versão do aplicativo foi preparada como 0.3.0; não foi feita publicação.

## Distribuição e conta do GitHub

Medidas gratuitas propostas:

- Ativar autenticação de dois fatores/passkey na conta, guardar recuperação fora do repositório e restringir quem publica releases.
- Revisar mudanças em workflows e dependências antes de gerar versão; exigir CI para a branch principal quando o plano/repositório permitir sem pagamento.
- Actions checkout/setup-node agora estão fixadas por SHA oficial verificado, com atualização revisada por Dependabot. Manter essa fixação nas próximas alterações.
- Manter permissões mínimas de `GITHUB_TOKEN`, token de escrita somente na publicação; checkout já usa `persist-credentials: false`.
- Não executar código de pull requests não confiáveis com segredos; evitar combinações inseguras de `pull_request_target` com checkout do código externo.
- Fazer verificação gratuita de segredos e dependências no processo local/CI, com ferramentas de licença livre, como Gitleaks e npm audit. Recursos do GitHub só entram se estiverem disponíveis gratuitamente para o repositório.
- Se vazar segredo, revogar e substituir imediatamente; apagar do arquivo ou adicioná-lo ao `.gitignore` não basta. Planejar limpeza do histórico quando necessário.
- Manter origem do updater apontando para o repositório esperado e falhar diante de download inválido. Atualizações não devem carregar comandos ou scripts fornecidos pelo servidor de sinalização.
- O popup de atualização previsto ao iniciar o app deve usar apenas eventos do updater no processo principal. Exibir versão/notas como texto; não confiar em alertas, links de instalador ou instruções enviados pela sinalização. A instalação exige pacote validado e reinício por ação explícita, conforme o [plano de evolução](plano-de-atualizacoes.md#popup-de-atualização-ao-abrir-o-aplicativo).

**Assinatura opcional:** continuar permitindo instaladores sem Authenticode para cumprir a restrição de orçamento. O hash do updater detecta arquivo diferente do manifesto, mas não oferece prova independente de publicador se o atacante conseguir alterar manifesto e instalador juntos. Um hash publicado na mesma release também não resolve esse comprometimento. Não exigir compra de certificado; concentrar proteção na conta, workflow e acesso à publicação. Alertas do Windows podem continuar aparecendo em instaladores sem assinatura.

Referência: [uso seguro do GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use).

## Mídia e futuras telas simultâneas

- Manter escolha da fonte, indicador e parada acessível como controles básicos de uso, sem acrescentar avisos repetidos ou restrições contra prints/gravações. Nunca permitir que uma mensagem remota inicie uma captura nova.
- Não enviar miniaturas, SDP, ICE, nomes de janelas, IPs ou conteúdo de tela para telemetria e relatórios compartilháveis.
- Preservar a criptografia de transporte já usada pelo WebRTC. Anonimato e proteção contra cópia do conteúdo não são requisitos deste plano.
- Se TURN próprio for ativado, usar autenticação temporária, cotas e restrições de destinos; impedir uso como relay aberto e acesso a redes internas/endereços reservados do servidor. Testar o firewall, não apenas a configuração do aplicativo.
- Se SFU própria for ativada, limitar tokens por sala, participante e permissões para evitar abuso do serviço. Não adicionar E2EE como requisito de sigilo do conteúdo; credenciais administrativas continuam restritas ao servidor.
- Limitar publicações, assinaturas e pedidos pendentes para evitar esgotar CPU, memória e banda do servidor e dos computadores.
- Contas persistentes, histórico de acesso e gravação não entram automaticamente no escopo. Coletar menos dados reduz a superfície de exposição.

## Operação sem serviços pagos

O [plano de evolução](plano-de-atualizacoes.md#infraestrutura-sem-contratação-de-serviços) define as escolhas permitidas. Para implantar:

1. Usar Electron/WebRTC e P2P com limites pequenos; não contratar TURN/SFU gerenciados.
2. Para sinalização no Render, selecionar Free e subdomínio fornecido. Antes de publicar, conferir faturamento: [excedentes podem ser cobrados quando existe forma de pagamento](https://render.com/docs/free); sem ela, os serviços gratuitos são suspensos ao esgotar banda. Se a conta não puder assegurar ausência de cobrança, não usar essa configuração.
3. Usar somente runners padrão gratuitos elegíveis e respeitar armazenamento/cache. [Runners maiores são cobrados](https://docs.github.com/en/billing/concepts/product-billing/github-actions); não habilitá-los. Em repositório privado, respeitar a franquia ou gerar o instalador localmente.
4. Não adquirir certificado Authenticode, domínio, IP público ou hardware como requisito do projeto. TLS pode ser fornecido gratuitamente pela hospedagem; qualquer alternativa própria deve ser validada sem contratação.
5. TURN/coturn e LiveKit open source são opcionais em máquina existente, com disponibilidade e rede adequadas. Se isso exigir gasto adicional ou não funcionar sob CGNAT, adiar e documentar a limitação P2P.
6. Ao alcançar cota ou capacidade, suspender conexões, reduzir qualidade/limites ou aguardar o próximo período. Alertas por si só não são bloqueio financeiro; não cadastrar pagamento nem aceitar upgrade como solução automática.

Não foi inspecionada a configuração de cobrança das suas contas. Serviços gratuitos podem mudar condições; rever os limites antes de cada mudança de hospedagem. A restrição é não contratar serviços, aceitando as limitações; energia e internet já utilizadas continuam necessárias.

## Verificação antes de ampliar o grupo

- [ ] Sandbox, preload, IPC e protocolo local testados contra acesso indevido a arquivos e execução de comandos.
- [ ] Papéis validados no servidor; participante não assume privilégios administrativos ao reconectar ou trocar IDs.
- [ ] Mensagens inválidas/grandes e tentativas entre salas são rejeitadas nos dois lados.
- [ ] WSS, origem de produção e comportamento dos limites atrás do proxy conferidos.
- [ ] Servidor sem privilégios administrativos, portas mínimas e separação de arquivos/segredos verificados no ambiente real.
- [ ] Cenário de servidor comprometido testado contra o app; sinalização não controla instaladores, comandos ou arquivos locais.
- [ ] `/api/stats` sem dados pessoais, com autenticação e limites.
- [ ] Microfone/câmera negados; captura e áudio respeitam escolha e parada do usuário.
- [ ] Alertas da cadeia de empacotamento tratados ou justificados com revisão agendada.
- [ ] Revisão de workflows, permissões, actions e segredos concluída.
- [ ] Configuração real dos provedores impede excedentes pagos; cotas e suspensão documentadas.
- [ ] TURN/SFU, quando existentes, não funcionam como serviço público sem autorização.

Os testes acima serão locais ou em infraestrutura própria autorizada, sem tráfego abusivo contra serviços de terceiros.
