# Validação e entrega local — 0.8.0

**Data:** 16 de outubro de 2026. **Estado:** implementação e pacote Windows preparados localmente, sem commit/push, tag ou release publicados por esta entrega. **Protocolo:** 3, compatível com as salas 0.7.0. A homologação externa da etapa 0.8-A continua separada e pendente.

## Alterações

- Foco, seleção de texto e menus preservados quando a sala recebe atualizações; retorno a um ponto útil se o controle desaparece.
- Tab e Shift+Tab limitados aos controles visíveis dos diálogos, incluindo selects; Escape fecha menus e restaura foco. Link de acesso ao conteúdo, foco visível e anunciador persistente sem repetição para o mesmo estado.
- Estados de recepção e recuperação mais claros. **Atualizar janelas** consulta novamente as fontes sem iniciar captura e pede nova seleção/consentimento.
- Teto de vídeo por espectador de **1 a 30 Mbps**, indicação em MB/s, retorno ao padrão e ajuste durante a transmissão. Orçamento total e adaptação continuam prevalecendo.
- Diagnóstico de suporte schema 2 com estados resumidos, idade da amostra, versões de runtime e memória do renderer. Campos são permitidos explicitamente e o runtime vem do processo principal; nomes, convites, tokens, endpoint, SDP/ICE e conteúdo continuam excluídos.
- Verificação de tamanho e SHA-512 do instalador, manifesto da versão atual e blockmap antes do envio pelo workflow. Somente esses três artefatos entram na publicação. Assinatura permanece opcional.
- Teste contínuo P2P disponível em `npm run test:soak`, com duração padrão de 30 minutos. Nenhuma SFU ou serviço pago adicionado.

## Testes e verificações

| Verificação                                           | Resultado                                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                            | 141 testes aprovados, 15 arquivos.                                                                                  |
| `npm run typecheck` / `npm run build`                 | Aprovados.                                                                                                          |
| `npm run format:check` / `git diff --check`           | Aprovados.                                                                                                          |
| `npm audit --audit-level=moderate`                    | Zero vulnerabilidades conhecidas informadas na consulta.                                                            |
| `npm run test:accessibility`                          | Oito cenários aprovados no Electron: teclado, caret, menus, modal, foco, anunciador e controle de bitrate.          |
| `npm run test:e2e`                                    | 21 cenários de vídeo aprovados no runtime de desenvolvimento.                                                       |
| `node scripts/smoke.mjs --packaged`                   | Os mesmos 21 cenários aprovados no executável Windows empacotado final.                                             |
| `node scripts/multistream-smoke.mjs --soak-minutes=3` | Nove cenários aprovados, com duas publicações, quatro instâncias e 180 segundos de recepção contínua instrumentada. |
| `npm run test:audio`                                  | 16 cenários aprovados com som sintético, sem captura de áudio pessoal.                                              |
| `npm run test:rooms`                                  | Dez cenários aprovados, incluindo menus preservados e mudança de sala.                                              |
| `node scripts/check-updater.mjs`                      | Cinco verificações aprovadas com o atualizador real do pacote e provedor local. Nenhum instalador executado.        |
| `npm run release:verify`                              | Manifesto, versão, tamanho, SHA-512 e blockmap do instalador 0.8.0 aprovados.                                       |

Os testes do atualizador cobrem versão atual sem popup, falta de conexão sem inutilizar o app, pacote com hash inválido recusado, download válido aguardando reinício e proteção privilegiada contra instalação enquanto o estado nativo indica compartilhamento. Esse último caso controla o estado nativo de forma isolada; não é uma instalação durante uma chamada real. O cenário usa manifesto de fixture com versão maior e o instalador local como conteúdo de teste; não comprova atualização entre duas versões instaladas.

Os cenários de vídeo capturam somente uma janela sintética. Na enumeração inicial, o Windows apresentou falhas transitórias de captura/miniatura; o teste usa o identificador da janela própria e, quando necessário, o novo controle **Atualizar janelas**. A regressão final passou sem selecionar monitores ou janelas pessoais. Verificações de texto de avisos foram limitadas à mensagem visível para não confundir o anúncio equivalente destinado ao leitor de tela.

## Medições de bitrate e continuidade

O teste alterou o teto de vídeo para **24.000.000 bits/s** e confirmou esse valor nos parâmetros reais dos emissores RTP, depois restaurou o teto padrão de 12 Mbps sem reiniciar a captura. Na execução empacotada, a amostra recebeu aproximadamente **6,43 Mbps**, **52,6 FPS** e **1920 × 1032**. Na execução de desenvolvimento foram aproximadamente **6,25 Mbps** e **51,7 FPS** nessa fase.

Isso confirma o aumento do teto permitido, não consumo constante de 3 MB/s nem garantia de 1080p/60. O ambiente informou codificação/decodificação por software. A janela de teste foi limitada pela área útil do Windows a 1920 × 1032. Nas fases iniciais de movimento houve redução de resolução; no cenário de publicador minimizado do pacote foram aproximadamente 57,2 FPS em 1920 × 1032. Fonte, CPU, rede e controle nativo de congestionamento continuam influenciando o resultado.

No ensaio de duas publicações, a recepção instrumentada continuou por **180,023 segundos**, com amostras aproximadamente entre **55,7 e 56,4 FPS**. Houve duas conexões de envio por publicador e uma recepção por espectador; elas não se acumularam durante o período. Depois, parada individual, moderação e encerramento de sala liberaram os recursos esperados.

A prévia própria foi pausada e desconectada do player com a janela minimizada, enquanto o receptor avançou 173 quadros no intervalo instrumentado e a track permaneceu ativa com as mesmas constraints. O roteamento de blur/focus foi testado com eventos emitidos na janela; Alt-Tab real em outras máquinas continua no roteiro manual.

O working set do renderer do publicador variou de 225384 KiB na primeira amostra do período contínuo para 209684 KiB na última; os bytes privados passaram de 139320 para 161472 KiB. Portanto, **não se conclui redução de RAM ou ausência de vazamentos** a partir desse ensaio curto. Ele verifica continuidade e número de conexões; CPU/GPU/RAM e qualidade sustentada precisam de avaliação representativa com o grupo.

## Pacote gerado

- `release/Discorja-Setup-0.8.0.exe`: instalador NSIS x64, 111510631 bytes.
- `release/Discorja-Setup-0.8.0.exe.blockmap`: metadados diferenciais.
- `release/latest.yml`: manifesto da mesma compilação.
- SHA-512 em Base64 do instalador: `t/SmYOP5lYSiap1B8BuLPRSg3trmWw843ah5hs76T8d0jUhEQ31DOtcnpmmC4qWhzI4LC9XPDbSx8G0dpbcmDg==`.
- Authenticode: `NotSigned`, conforme o modo opcional escolhido.
- Updater configurado para `DevCordeirocf/Discorja`, sem token embutido. Nenhum arquivo foi publicado ao GitHub por esta entrega.

Os instaladores anteriores presentes na pasta local foram preservados e não entram na lista dos três arquivos validados para esta release. Arquivos gerados, perfis e relatórios continuam ignorados pelo Git.

## O que ainda exige o ambiente real

1. **Endpoint WSS e hospedagem:** configurar/conferir o servidor usado pelo grupo, executar `server:check`, verificar TLS, restrições do host e credencial administrativa opcional. Não foi fornecido um endpoint real nesta etapa; nenhum servidor remoto foi alterado ou certificado.
2. **Grupo e qualidade:** sessão de pelo menos 30 minutos em computadores/redes diferentes, CPU/GPU/RAM, perda, latência, resolução/FPS recebidos e Alt-Tab. O comando local de 30 minutos está disponível; foram executados três minutos instrumentados nesta entrega.
3. **Áudio:** captura nativa de dispositivos, sincronização e uso com Discord. O teste sintético não comprova isolamento por janela ou ausência de vozes recapturadas na máquina dos amigos.
4. **Distribuição instalada:** publicar os três arquivos validados e testar duas instalações reais, preservação das configurações, download/reinício e recuperação de falhas. O teste do updater não substituiu uma instalação existente.
5. **Contas e cotas:** conferir no ambiente escolhido a ausência de cobrança habilitada, os limites e o comportamento ao esgotá-los. O código não exige serviço pago, mas não verifica a configuração financeira da conta.
6. **Acessibilidade externa:** testar leitor de tela e preferências visuais no ambiente de uso. Os oito cenários locais comprovam as interações testadas; não são certificação de todas as tecnologias assistivas.

O procedimento está em [operacao.md](operacao.md). O código e o pacote 0.8.0 ficam concluídos localmente; os critérios externos da 0.8-A não foram marcados como aprovados. Não foi iniciada a versão 1.0.
