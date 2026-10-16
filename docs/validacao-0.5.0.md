# Validação da versão 0.5.0

## Estado

Implementação local de **0.5-A e 0.5-B** preparada. A 0.4.0 foi enviada separadamente ao GitHub no commit `cc0c79a`, antes de continuar esta etapa. A implementação 0.5.0 ainda não foi commitada ou publicada nesta rodada.

## Alterações

- Protocolo 2 confirmado antes de abrir a sessão; diagnóstico de incompatibilidade com servidor anterior.
- Dono, moderador e participante independentes do transmissor autorizado.
- Autorização de publicação, moderação, remoção e encerramento validada no servidor, com IDs restritos à sala.
- Snapshots limitados e validados, com papéis conservados pelo servidor na retomada; tokens individuais não são enviados aos demais membros.
- Nome de sala, painel de salas, doze convites recentes por armazenamento local e separação por endpoint.
- Confirmação de troca; encerramento de áudio, vídeo, WebRTC e sinalização anteriores antes da próxima conexão. Sem mídia inativa em segundo plano.
- Uma publicação por sala. Conceder permissão não inicia captura; mudar o transmissor encerra a publicação anterior.
- Saída do dono encerra a sala; saída/remoção do transmissor devolve a permissão ao dono com captura parada.
- Compatibilidade de transição: clientes antigos ficam em salas do protocolo anterior; não se misturam com as novas.
- Pacote e lockfile em 0.5.0, sem novas dependências ou serviços pagos.

## Verificações executadas

- **101 testes automatizados** em onze arquivos aprovados.
- Verificação de tipos e build desktop/servidor aprovados.
- **20 cenários integrados de vídeo** aprovados no protocolo 2, incluindo captura real, parâmetros, recuperação e limpeza.
- **16 cenários integrados de áudio** aprovados no novo protocolo, incluindo troca de sala com som ativo, usando exclusivamente uma fonte de teste gerada.
- **10 cenários integrados de salas** aprovados com quatro aplicativos locais: salas independentes, cancelamento, fechamento de tracks/conexões anteriores, convites sem recepção em segundo plano, mudança de transmissor sem captura remota automática, administração independente da publicação, moderação, encerramento pelo dono e falha de entrada sem mídia residual.

Os relatórios detalhados são `test-results/smoke.json`, `test-results/audio-smoke.json` e `test-results/rooms-smoke.json`; ficam fora do Git. O encerramento das conexões antigas foi observado no WebRTC real. Não foi feita captura de pacotes ou medição do tráfego total da placa de rede.

## Antes de distribuir

- Implantar o servidor 0.5.0 primeiro e conferir WSS/origens/limites. Não é necessário habilitar uma nova rota ou variável de salas.
- Avisar o grupo sobre o reinício do servidor, que encerra salas em memória. Criar salas novas com os clientes 0.5.0.
- Publicar os artefatos com o fluxo de release existente e validar instalação/atualização. Não foi gerado ou publicado um instalador 0.5.0 nesta rodada.
- Repetir troca de sala, moderação, retomada e carga em computadores/redes separados, incluindo um e quatro receptores.
- Continuar os ensaios de áudio nativo, dispositivos físicos, Discord e sincronização prolongada da [0.4.0](validacao-0.4.0.md). Esta etapa não implementa isolamento de som por processo.
- Manter as verificações operacionais de segurança da 0.3.0 que ainda exigem acesso ao ambiente real.

Instruções de uso e política de permissões em [salas.md](salas.md). As salas simultaneamente abertas para grupos diferentes são suportadas pelo servidor; um aplicativo continua com uma sala de mídia ativa. Várias telas simultâneas permanecem fora desta etapa.
