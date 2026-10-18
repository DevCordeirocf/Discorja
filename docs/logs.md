# Logs de erros e encerramento de salas — 0.8.1

Os logs são locais e gratuitos. O aplicativo grava os eventos automaticamente; o servidor envia registros estruturados para a saída do processo. Não é necessário contratar monitoramento ou configurar uma conta externa.

## Como salvar os logs do aplicativo

1. Use uma compilação 0.8.1 ou posterior. As versões anteriores não registram esse histórico.
2. Depois de uma queda, abra **Configurações → Salvar logs de erros**. Essa opção também funciona na tela inicial, depois que a sala foi encerrada.
3. Escolha onde salvar `discorja-logs.json`. O arquivo reúne os registros recentes e pode ser analisado pelo desenvolvedor.
4. Se o app fechar, reabra e salve os logs antes de repetir muitas vezes a sessão, para preservar os eventos antigos.

Na instalação Windows padrão, os arquivos ficam em `%APPDATA%\Discorja\logs`. Um perfil de teste com `--user-data-dir` usa o diretório desse perfil. A pasta é definida pelo processo principal, sem aceitar caminhos do renderer.

São mantidos `discorja.log`, `discorja.1.log` e `discorja.2.log`, com até 512 KiB cada. O mais antigo é substituído ao atingir o limite; não há prazo de retenção em dias. Uma exceção fatal do processo principal pode deixar também `discorja.fatal.log`, um único registro pequeno que substitui o anterior. Os logs sobrevivem ao fechamento normal do app.

As gravações comuns são assíncronas e serializadas, sem registrar frames ou cada pacote de vídeo. A fila comporta até 100 registros pendentes. `droppedRecords` conta descartes da fila e falhas de gravação na execução atual; limites de frequência também podem suprimir eventos. Se o disco não permitir gravar, a chamada continua funcionando; a exportação informa a falha enquanto ela persistir. Não se promete histórico completo após falta de energia ou encerramento forçado.

## O que fica registrado

Cada registro contém `schemaVersion`, `timestamp` UTC, `runId`, `event` e campos permitidos em `details`. `version` identifica a compilação; `session` diferencia tentativas de sala dentro da mesma execução do app. O servidor usa outro `runId`, próprio do processo, e um `roomId` aleatório para correlacionar seus eventos; ele não corresponde ao convite da sala.

| Evento                                                       | Como interpretar                                                                                                                                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.started` / `app.stopping`                               | Abertura e saída normal do app.                                                                                                                                                                   |
| `signal.closed`                                              | Conexão de sinalização fechada: `code`, `clean` e duração da conexão em milissegundos. `1006` indica fechamento anormal; não identifica sozinho se a falha foi na rede, hospedagem ou computador. |
| `signal.recovery-started`, `signal.retry` e `signal.resumed` | Tentativas de recuperar a mesma sala e confirmação da retomada.                                                                                                                                   |
| `signal.recovery-failed`                                     | Prazo de retomada esgotado, com `reason: deadline`. Uma recusa do servidor também aparece como `room.rejected`, por exemplo `serverCode: RESUME_REJECTED`.                                        |
| `room.closed`                                                | Motivo comunicado pelo servidor: `expired`, `host-left` ou `host-closed`.                                                                                                                         |
| `room.left`                                                  | Saída local: `user` quando solicitada pelo fluxo do app; `unknown` quando houve encerramento recebido ou falha. O evento anterior fornece o contexto.                                             |
| `capture.failed` / `rtc.failed`                              | Falha de captura ou conexão WebRTC; não comprovam queda da sala. `rtc.failed` registra os estados finais de conexão e ICE e o papel local (publicador/espectador), sem incluir SDP ou candidatos. |
| `renderer.error`, `renderer.rejection`, `renderer.gone`      | Erro inesperado, promessa não tratada ou término do processo da interface. Quando disponíveis, tipo/código do erro, componente e posição no código ajudam a localizar a falha.                    |
| `renderer.unresponsive` / `renderer.responsive`              | O Electron detectou que a interface parou de responder ou voltou.                                                                                                                                 |
| `power.suspend` / `power.resume`                             | O sistema notificou suspensão ou retomada; permite comparar o horário com a desconexão.                                                                                                           |
| `updater.error`                                              | Falha na verificação, download ou validação da atualização.                                                                                                                                       |
| `renderer.audio-startup`                                     | Diagnóstico do efeito sonoro inicial (`initializing`, `playing`, `started`, `ended` ou `failed`); `ended` indica que o elemento terminou a reprodução, não confirma saída física de áudio.        |

Não são gravados nomes dos participantes, códigos de convite, endereços do servidor, IPs, tokens, senhas, conteúdo de áudio/vídeo, SDP/ICE, mensagens livres de erro ou stacks completos. Somente eventos e valores previstos pelo código são aceitos. O renderer passa por validação de origem, saneamento e limite de 40 solicitações de log a cada dez segundos; não pode registrar eventos reservados ao processo principal ou ao servidor.

## Logs do servidor

Atualize também o código da sinalização e reinicie o processo durante uma janela sem usuários. Não basta atualizar o instalador para obter os registros do servidor.

- Na Render, consulte a área **Logs** do serviço, além dos eventos de deploy, parada, reinício e limites de recursos da plataforma.
- Cada requisição HTTP, tentativa de conexão WebSocket e mensagem recebida pelo WebSocket gera `request.received`, com canal, operação, método/status quando aplicáveis e protocolo do cliente. O registro não inclui URL, IP, nomes, código da sala, token, SDP/ICE nem o payload enviado.
- Em um computador próprio, os registros aparecem no terminal de `npm run server:start` ou `npm run server:dev`. Para preservar a saída manualmente no PowerShell, use `npm run server:start 2>&1 | Tee-Object -FilePath .\discorja-server.log -Append`. Esse arquivo manual não tem rotação automática; remova ou arquive quando não for mais necessário. A pasta `logs/` e arquivos `*.log` são ignorados pelo Git.
- No Docker, consulte os logs do container. O Compose do projeto limita seus arquivos de log pelo mecanismo do Docker.

As linhas JSON da sinalização usam os seguintes eventos:

| Evento                           | Dados úteis                                                                                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `server.started`                 | Versão, protocolo, `roomTtlMs` e `resumeGraceMs` efetivamente aplicados.                                                                      |
| `server.stopping`                | Recebimento de `SIGINT` ou `SIGTERM`, quando houver oportunidade de tratar o sinal.                                                           |
| `room.created`                   | Identificador de diagnóstico independente do convite, protocolo e duração máxima configurada.                                                 |
| `room.ended`                     | `reason`, `durationMs`, protocolo e quantidade de participantes ainda associados, incluindo sessões aguardando retomada.                      |
| `connection.closed`              | Código de fechamento WebSocket e identificador de diagnóstico da sala quando ainda associado.                                                 |
| `connection.heartbeat-timeout`   | O servidor encerrou uma conexão que não respondeu ao ping periódico.                                                                          |
| `room.rejected` / `server.error` | Código previsto de recusa ou tipo/código de erro do processo. Recusas repetidas são limitadas a 40 registros a cada dez segundos no processo. |

Falhas do transporte também podem gerar `connection.error`, com tipo/código previsto do erro e identificador de diagnóstico da sala. Mensagens livres recebidas da rede não são copiadas para esse registro.

O servidor não depende de um arquivo gravável dentro do container. A retenção e disponibilidade da saída dependem da hospedagem. Seu estado de salas continua em memória: reiniciar o servidor perde as salas; os logs não oferecem persistência nem recuperação delas.

## Investigar a queda depois de aproximadamente 20 minutos

1. Salve os logs do app logo depois da ocorrência e anote o horário local.
2. Nos logs do servidor, confira `server.started.details.roomTtlMs`: `1200000` é 20 minutos; `14400000` é o padrão de quatro horas. `resumeGraceMs: 20000` é **20 segundos de retomada**, não a duração da sala.
3. Procure `room.ended`. `expired` confirma expiração; `host-left` indica saída do dono ou perda definitiva da associação; `host-closed` indica encerramento explícito. O app agora distingue perda/saída do dono de encerramento explícito na mensagem exibida.
4. Compare `signal.closed`, `signal.retry`, `signal.recovery-failed` e `power.suspend` com os eventos da hospedagem. Um novo `server.started` com outro `runId` indica uma nova execução do processo. Uma parada brusca pode não registrar `server.stopping`.
5. Se a plataforma matou o processo, investigue seus eventos de reinício, suspensão, memória e deploy. O app não consegue deduzir sozinho qual desses motivos ocorreu.

O teste com relógio simulado mantém uma sala com apenas o dono após 21 minutos e só expira no prazo padrão de quatro horas nos protocolos 1, 2 e 3. Ele valida a regra de expiração; não reproduz uma sessão de 21 minutos na hospedagem real. A causa do relato original ainda precisa ser observada com os logs ativados.

## Validação local

```powershell
npm run typecheck
npm test
npm run build
npm run test:logs
```

Para conferir o executável empacotado após `npm run dist:win -- --publish never`, use `node scripts/logs-smoke.mjs --packaged`. O teste usa um perfil próprio e não executa o instalador.

O teste integrado usa perfil isolado e uma sala sintética, sem captura. Valida queda inesperada do WebSocket com retomada, servidor desligado até esgotar a recuperação, exportação pela interface, saneamento e preservação do histórico após reabrir o app. Os eventos de suspensão/retomada são injetados nesse teste; ele não suspende o Windows. Os testes unitários cobrem rotação, fila, falha de disco, registro fatal, leitura limitada, rejeição de eventos indevidos e motivos de encerramento no servidor.

Os registros não existem retroativamente e o instalador com esta implementação precisa ser distribuído. Não há envio automático dos arquivos ao desenvolvedor.

### Resultado desta entrega

- 152 testes automáticos aprovados em 16 arquivos, incluindo expiração com relógio simulado, motivos do servidor e armazenamento dos logs.
- Cinco cenários de logs aprovados no modo de desenvolvimento e repetidos com sucesso no executável Windows empacotado. O relatório deste último está em `test-results/logs-smoke-packaged.json`.
- Oito cenários de teclado/acessibilidade aprovados após a inclusão do botão de exportação.
- Processo real da sinalização verificado com configuração de duração específica, confirmação da versão 0.8.1 e encerramento explícito registrado sem convite ou nome do participante.
- Tipagem, compilação, formatação e integridade dos artefatos de atualização aprovadas.

O instalador local é `release/Discorja-Setup-0.8.1.exe`, Windows x64, 111514710 bytes. SHA-512 em base64: `YqP1M0wfK/ZS7sMx96P9J/GmeU6GrhS1tNAWXHIBW5WflQ9QWAjhzB8hFJ9az39qTxLmSrgvHxbnqarG4MyncQ==`. Foi gerado sem assinatura, conforme a configuração opcional do projeto, e não foi publicado no GitHub nesta entrega. O teste abriu o executável empacotado com perfil isolado; não executou o instalador nem validou atualização entre duas instalações.

Para ativar os registros no uso real, distribua o app 0.8.1 e atualize/reinicie a sinalização com este código, sem usuários conectados no momento do reinício. Não há variável de ambiente nova obrigatória. A queda original após aproximadamente 20 minutos ainda não foi reproduzida nem teve sua causa confirmada.
