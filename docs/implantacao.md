# Hospedar a sinalização

O servidor mantém salas em memória e encaminha mensagens de negociação WebRTC. Ele não recebe a captura de tela. Um TURN, quando configurado nos aplicativos, exerce uma função separada e pode retransmitir o vídeo.

Para uso local, o servidor e os aplicativos podem ficar no mesmo computador. Para amigos em computadores diferentes, publique um único endpoint WSS acessível a todos. O GitHub hospeda código e instaladores; não executa este serviço continuamente.

Os exemplos usam PowerShell, exceto blocos identificados como Caddyfile. Substitua os domínios fictícios e adapte o gerenciamento do serviço ao sistema do host. Você precisará de Node.js 22.12+ ou Docker; para o exemplo de proxy próprio, também de domínio, DNS e Caddy instalado. Se a plataforma já entrega TLS e WebSocket, use o endpoint dela.

## Servidor local

```powershell
npm ci
npm run server:build
$env:HOST = '127.0.0.1'
$env:PORT = '8787'
npm run server:start
```

`server:build` cria `dist/server/` e os módulos necessários de `dist/shared/`. Não é necessário abrir Electron para executar a sinalização. Para instalar dependências em um host destinado apenas ao servidor e evitar baixar o runtime desktop:

```powershell
$env:ELECTRON_SKIP_BINARY_DOWNLOAD = '1'
npm ci
npm run server:build
```

Esse ajuste serve para o host de sinalização. Em um terminal de desenvolvimento desktop, remova a variável antes de instalar as dependências para permitir o download do Electron.

**Carregamento de configuração:** `npm run server:dev` lê o `.env` da raiz. `npm run server:start` não lê esse arquivo; configure o ambiente do serviço antes de iniciar. Se quiser carregar um arquivo explicitamente no processo compilado:

```powershell
node --env-file=.env dist/server/index.js
```

O arquivo deve existir no caminho informado e conter a configuração desse host, fora do Git. Variáveis já presentes no ambiente prevalecem sobre o arquivo. Nenhuma variável de configuração do servidor é distribuída automaticamente aos clientes.

`GET /health` responde com `{"status":"ok"}` se o processo estiver disponível. Os caminhos `/` e `/ws` aceitam WebSocket. Um resultado saudável não comprova que dois aplicativos conseguem estabelecer uma conexão WebRTC.

## Contagem de conexões e sessões

A versão 0.3.0 oferece `GET /api/stats`. Sem `STATS_TOKEN`, retorna 404. Configure somente no ambiente do servidor um segredo aleatório de 32 a 256 caracteres, sem espaços. Exemplo para gerar e usar localmente, sem imprimir o segredo:

```powershell
$env:STATS_TOKEN = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
# Inicie o servidor nesse ambiente; em hospedagem, cadastre o segredo nas variáveis do serviço.
Invoke-RestMethod 'http://127.0.0.1:8787/api/stats' -Headers @{ Authorization = "Bearer $env:STATS_TOKEN" }
```

Fora de localhost, consultar por HTTPS. Não colocar o token em URL, código versionado, screenshots ou no aplicativo distribuído. A credencial é para o administrador; não é necessário configurá-la nos apps dos amigos. Trocar o segredo exige reiniciar o serviço e atualizar o consumidor administrativo.

Resposta: `schemaVersion`, `scope: instance`, `websocketConnections`, `participantSessions`, `roomMemberships`, `activeRooms`, `reportedScreenPublishers` e `generatedAt`. São contagens atuais, sem nomes/IPs/códigos. Sessões representam instâncias conectadas do app em uma sala, não pessoas únicas. Publicadores são declarados pela sinalização, não comprovação de vídeo recebido. Conexões interrompidas só deixam de contar quando detectadas pelo transporte/heartbeat.

Há limite de 30 consultas por minuto por endereço TCP, inclusive consultas sem autorização; excesso retorna 429 e não afeta `/health`. Atrás de proxy, vários administradores podem compartilhar esse limite. Token inválido retorna 401, método diferente de GET com autenticação válida retorna 405. Não há armazenamento histórico.

## Retomada após queda breve

O servidor guarda a associação de uma conexão interrompida por até `RESUME_GRACE_MS` (padrão 20 segundos, máximo 60 segundos; zero desabilita). O app 0.3.0 tenta retomar por até 18 segundos com espera progressiva e token temporário mantido em memória. O servidor valida a associação existente e gira o token após uso, sem aceitar papel escolhido pelo cliente. Saída voluntária, expulsão, encerramento e expiração revogam a associação.

Durante a recuperação, os peers são recriados; o anfitrião pode reutilizar somente a captura já autorizada e ainda ativa. Não há nova escolha de janela automática. Se o prazo acabar ou o servidor perder o estado, a captura para e é necessário entrar novamente. Reiniciar/reimplantar o servidor perde salas em memória: não existe migração entre processos. Clientes antigos continuam usando o fluxo básico, sem retomada.

## Docker

O Dockerfile gera uma imagem Linux somente para a sinalização. O aplicativo Electron continua instalado nos computadores Windows.

Para aplicar as restrições adicionais da 0.3.0, prefira `docker compose up -d --build` usando o `compose.yml` incluído: usuário não root, sistema de arquivos somente leitura, capacidades removidas, sem novos privilégios, limites de processos/CPU/memória e rotação de logs. A porta fica restrita a localhost para um proxy TLS já disponível; o compose não publica um endpoint WSS sozinho. Não monta diretórios pessoais ou socket de administração. Não foi validado nesta revisão em um Docker disponível; conferir compatibilidade antes de implantar. O Dockerfile mantém verificação de saúde em `/health`.

```powershell
docker build -t discorja-signaling .
docker run --rm --name discorja-signaling -p 127.0.0.1:8787:8787 -e ALLOWED_ORIGINS=app://discorja discorja-signaling
```

Esse exemplo fica em primeiro plano e remove o container quando ele termina. Para um serviço persistente, execute em segundo plano com política de reinício, em vez do exemplo anterior:

```powershell
docker run -d --name discorja-signaling --restart unless-stopped -p 127.0.0.1:8787:8787 -e ALLOWED_ORIGINS=app://discorja -e MAX_VIEWERS=9 -e ROOM_TTL_MS=14400000 discorja-signaling
docker logs --tail 100 discorja-signaling
docker inspect --format '{{.State.Health.Status}}' discorja-signaling
```

O nome precisa estar livre ao criar o container. A imagem contém a sinalização e suas dependências de produção; não executa a aplicação desktop, TURN ou proxy TLS. A porta 8787 é interna, e o processo usa usuário sem privilégios. Não há banco de dados ou volume de salas a restaurar. A política de reinício inicia outro processo, com salas vazias.

A publicação em `127.0.0.1` permite que um proxy TLS no mesmo host encaminhe as conexões. Caso o proxy também esteja em um container, coloque ambos em uma rede Docker e encaminhe para `discorja-signaling:8787`; ajuste a exposição da porta de acordo com essa topologia.

## Endpoint público

1. Escolha um host que mantenha conexões WebSocket abertas e permita configurar TLS.
2. Aponte um domínio para esse host e configure um certificado TLS válido para ele.
3. Encaminhe as requisições HTTP e o upgrade WebSocket para a porta 8787 do processo. O timeout do proxy deve permitir conexões longas.
4. Mantenha a porta interna acessível apenas pelo proxy.
5. Configure `ALLOWED_ORIGINS` para o aplicativo de produção e quaisquer origens de desenvolvimento que você autorize.
6. Informe o endpoint `wss://seu-dominio` em todos os aplicativos.

O aplicativo instalado envia `Origin: app://discorja`; não use o domínio público da sinalização como se fosse a origem da interface. Os endereços `http://127.0.0.1:5173` e `http://localhost:5173` só são necessários se você também autorizar clientes em desenvolvimento. WSS é obrigatório fora de `localhost`/`127.0.0.1`, inclusive na rede local. Um certificado TLS inválido não deve ser contornado desabilitando a segurança do Electron.

O proxy precisa preservar o caminho `/` ou `/ws` do WebSocket. Um prefixo como `/discorja/ws` exige reescrita no proxy, pois o servidor não o aceita diretamente. `/health` recebe HTTP GET; não é o endereço de entrada nas salas. O servidor envia ping WebSocket periodicamente; configure o host/proxy para permitir sessões longas e esse tráfego.

Exemplo de proxy com Caddy, executado no mesmo host do container:

```caddyfile
sinal.exemplo.com {
    reverse_proxy 127.0.0.1:8787
}
```

Substitua o domínio e faça a configuração de DNS/TLS no ambiente escolhido. Consulte a [documentação do proxy reverso do Caddy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy). O projeto não provisiona domínio, hospedagem ou TURN e não pressupõe disponibilidade de plano gratuito.

Nesse exemplo público de Caddy, aponte A/AAAA para o host, disponibilize 80/443 e mantenha o armazenamento de certificados persistente. Valide a configuração e recarregue o serviço Caddy da instalação escolhida. Veja os requisitos de [HTTPS automático](https://caddyserver.com/docs/automatic-https).

Depois, verifique a partir de outro computador:

```powershell
Invoke-RestMethod https://sinal.exemplo.com/health
```

Configure `wss://sinal.exemplo.com` nos aplicativos e teste criar/entrar na sala. Verificar `/health` não testa o upgrade WebSocket, a autorização de origem ou o caminho da mídia.

### Plataforma com TLS gerenciado

Ao usar uma plataforma de containers ou processos Node.js, configure o diretório raiz do projeto, Node.js compatível e uma única réplica. Para implantação por código, use `npm ci` e `npm run server:build` no build e `npm run server:start` na inicialização. Se usar o Dockerfile, seus comandos de build e inicialização já estão definidos.

No ambiente da plataforma, defina `HOST=0.0.0.0`, `ALLOWED_ORIGINS=app://discorja` e os limites desejados. A porta do processo precisa ser a porta encaminhada pela plataforma: use `PORT` fornecida por ela ou configure explicitamente `8787` conforme o serviço. O Dockerfile expõe 8787 como referência; isso não substitui o encaminhamento e o TLS do provedor.

Configure o health check HTTP em `/health` e confirme suporte a WebSocket, ausência de suspensão durante salas e prazo de conexão compatível. Se o serviço terminar conexões por um limite fixo, haverá interrupção e criação de novas salas; o MVP não migra uma sala entre processos.

## Variáveis do servidor

| Variável          | Função                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HOST`            | Interface de escuta; no container, `0.0.0.0`. Use `127.0.0.1` para um processo restrito à máquina local.                                                            |
| `PORT`            | Porta HTTP/WebSocket; padrão `8787`.                                                                                                                                |
| `ALLOWED_ORIGINS` | Lista de origens permitidas separadas por vírgula. Padrão: `app://discorja,http://127.0.0.1:5173,http://localhost:5173`. Em produção, restrinja a `app://discorja`. |
| `MAX_VIEWERS`     | Número máximo de espectadores além do criador; padrão e máximo `9` (10 participantes totais).                                                                       |
| `MAX_PUBLISHERS`  | Telas simultâneas no protocolo 3; padrão `2`, intervalo de 1 a 4 sem ultrapassar `MAX_VIEWERS + 1`. Manter duas no piloto.                                          |
| `ROOM_TTL_MS`     | Duração máxima de uma sala em milissegundos; padrão `14400000` (quatro horas).                                                                                      |
| `MAX_ROOMS`       | Limite de salas simultâneas no processo; padrão `5`.                                                                                                                |
| `MAX_CLIENTS`     | Limite de conexões simultâneas no processo; padrão `20`.                                                                                                            |
| `RESUME_GRACE_MS` | Prazo de retomada: padrão `20000`, entre 0 e 60000; zero desabilita.                                                                                                |
| `STATS_TOKEN`     | Credencial administrativa de `/api/stats`; vazio desabilita a rota. Nunca distribuir no app.                                                                        |

Configure limites de acordo com a capacidade do host. No protocolo 3, `MAX_VIEWERS + 1` é o total de participantes, independentemente de quem publica; cada um assiste a uma tela por vez. Aumentar esse limite não resolve o upload dos publicadores. `MAX_PUBLISHERS` é configuração do servidor e não exige incluir segredos no aplicativo. A checagem de `Origin` reduz o uso por páginas de terceiros, mas não substitui autenticação nem impede clientes WebSocket próprios de enviar a mesma origem. Após implantar, use o diagnóstico e o roteiro de [operação](operacao.md).

`HOST` tem padrão `127.0.0.1` fora do container. Os limites numéricos precisam ser inteiros positivos. `PORT` aceita inteiros de 0 a 65535; 0 escolhe uma porta livre e é útil para testes, mas dificulta o encaminhamento de um serviço público. Configurações inválidas interrompem a inicialização em vez de serem silenciosamente ignoradas.

O limite de tentativas usa o IP da conexão TCP e ignora `X-Forwarded-For`. Atrás de um proxy, os participantes podem compartilhar o mesmo IP para esse controle. Os padrões por IP são 60 novas conexões por minuto, 40 tentativas de entrada em salas por minuto e 1000 mensagens a cada dez segundos; tentativas inválidas também contam. Esses limites são compartilhados pelos clientes que chegam pelo mesmo IP do proxy e atualmente não têm variáveis de ambiente próprias.

Há ainda limites por conexão: 200 mensagens a cada dez segundos e 12 tentativas de criar/entrar em salas por minuto. Mensagens têm limite de 64 KiB. Esses valores são definidos no servidor; não invente variáveis de ambiente para alterá-los.

Valide o ritmo de conexões e reconexões esperado pelo grupo no proxy escolhido e configure também sua proteção de tráfego. Não passe a confiar em `X-Forwarded-For` enviado pelo cliente para contornar o limite; uma futura identificação do IP original exigirá uma configuração explícita de proxies confiáveis.

Não execute várias réplicas como se compartilhassem o mesmo estado: as salas existem apenas em uma instância. Um reinício encerra as salas ativas. Para este MVP, use uma única instância e monitore memória, conexões, reinícios e disponibilidade de `/health`. Evite registrar códigos de sala, descrições SDP e candidatos ICE, que podem conter dados de conexão dos participantes.

## STUN e TURN nos clientes

Defina `DISCORJA_ICE_SERVERS` no ambiente que inicia o Discorja, tanto no anfitrião quanto nos espectadores. Exemplo de estrutura — os endereços e as credenciais abaixo precisam ser substituídos:

```powershell
$env:DISCORJA_ICE_SERVERS = '[{"urls":"stun:turn.exemplo.com:3478"},{"urls":["turn:turn.exemplo.com:3478?transport=udp","turns:turn.exemplo.com:5349?transport=tcp"],"username":"usuario-temporario","credential":"credencial-temporaria"}]'
```

No desenvolvimento, defina essa variável no `.env` usado por `npm run dev` ou no ambiente do terminal. No aplicativo instalado, feche-o e inicie o executável real a partir do ambiente configurado:

```powershell
& 'C:\CAMINHO_REAL_DA_INSTALACAO\Discorja.exe'
```

O instalado não carrega um `.env` próximo do executável. A tela de configurações permite editar somente o endpoint de sinalização, sem editor de servidores ICE. Definir TURN no ambiente do servidor ou do build não entrega a configuração aos amigos.

O array substitui a lista inteira; inclua seu STUN se quiser mantê-lo junto de TURN. O padrão, quando a variável não é definida, usa `stun:stun.l.google.com:19302`. `[]` remove servidores externos. São aceitos até oito objetos, com até oito URLs cada e credenciais textuais; JSON ou protocolo inválido impede a inicialização do app.

O valor é uma configuração local; não há entrega automática de credenciais temporárias neste MVP. Distribua-as por um canal privado, limite sua duração e consumo e renove-as quando necessário. A existência de TURN não garante conexão em toda rede. Consulte a [documentação de servidores TURN do WebRTC](https://webrtc.org/getting-started/turn-server).

Se hospedar seu próprio TURN, configure endereço público/NAT, autenticação, TLS para `turns:`, portas de escuta e a faixa de portas de relay conforme o serviço. O firewall precisa permitir as portas e os transportes realmente configurados. As portas 3478/5349 do exemplo são comuns, mas não abrem automaticamente a faixa de relay nem tornam o serviço utilizável. Não publique um TURN sem autenticação.

Confirme nas estatísticas do caminho selecionado um candidato `relay`. A simples presença de URLs TURN no JSON não comprova seu uso: a conexão pode ter escolhido um caminho direto. Esta versão não inclui opção de interface para forçar `iceTransportPolicy=relay`; a validação exige uma rede controlada que precise de relay ou um cliente de teste apropriado. Planeje consumo e disponibilidade do TURN: vídeo retransmitido continua consumindo upload do anfitrião e tráfego no serviço.

## Operação e atualizações do serviço

- Mantenha sinalização e proxy como serviços com reinício e acompanhe `/health`, memória, conexões e falhas. Não armazene códigos de sala, SDP ou candidatos ICE em logs de diagnóstico.
- Mantenha DNS/TLS válidos e renove credenciais do TURN antes do vencimento. Este MVP não renova credenciais nos aplicativos durante a sessão.
- Implante novas versões da sinalização separadamente do desktop. O GitHub Actions de release não atualiza seu host.
- Antes de substituir o processo/container, encerre o uso das salas. Reiniciar, atualizar ou parar o serviço encerra todas elas e não permite restaurar os códigos anteriores.
- Confira compatibilidade de protocolo antes de mudar mensagens compartilhadas. Não há negociação de versão de protocolo entre clientes antigos e servidor novo.

Para atualizar um container, construa uma nova imagem do código desejado, pare/remova apenas o container antigo e recrie-o com as mesmas configurações e o nome liberado. Preserve a configuração e os dados de certificados do proxy; isso é separado das salas em memória. Nenhum comando deste guia atualiza automaticamente a infraestrutura.

## Validação antes de convidar o grupo

- Verifique HTTPS e `/health` no domínio público.
- Crie uma sala em um computador e entre em outro, primeiro na mesma rede e depois em redes diferentes.
- Confirme o recebimento do vídeo, parar captura, remover espectador, fechar sala, expiração e reconexão após queda.
- Teste uma conexão que use TURN e acompanhe o consumo no serviço de retransmissão.
- Reinicie a sinalização e confirme que os aplicativos apresentam a interrupção e permitem criar outra sala.

Esses cenários de rede precisam ser executados no ambiente de implantação; testes locais e automatizados não os substituem.

## Diagnóstico por camada

| Verificação                                 | O que confirma                           | Se falhar                                                          |
| ------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| `http://127.0.0.1:8787/health` no host      | Processo/porta interna disponíveis       | Confira processo/container, `HOST`, `PORT` e logs.                 |
| `https://dominio/health` de outra rede      | DNS, TLS e encaminhamento HTTP           | Confira DNS, certificado, firewall e proxy.                        |
| Criar/entrar em sala pelo aplicativo        | WebSocket, origem e lógica de salas      | Confira `/` ou `/ws`, `ALLOWED_ORIGINS` e limites.                 |
| Prévia no anfitrião                         | Fonte autorizada produzindo vídeo        | Escolha novamente uma fonte disponível e evite conteúdo protegido. |
| Vídeo recebido                              | Caminho WebRTC e decodificação funcionam | Confira ICE, STUN/TURN e restrições de rede.                       |
| Caminho `relay`                             | TURN realmente usado naquela conexão     | Confira credenciais, transportes, TLS e portas do serviço TURN.    |
| Métricas sustentadas na qualidade escolhida | Desempenho daquele cenário               | Compare rede, processamento, fonte e número de espectadores.       |

Voltar ao [README](../README.md) ou ao [manual de releases](releases.md).
