# Validação local — 0.7.0 e início da 0.8-A

**Data:** 16 de outubro de 2026. **Base:** 0.5.0, commit `cac0121`. **Estado:** alterações locais, versão do pacote 0.7.0, sem commit, instalador ou release publicados por esta entrega. SFU permanece adiada.

## Entregue

- Duas publicações simultâneas no piloto P2P, uma por pessoa; cinco participantes totais por padrão.
- Uma única recepção escolhida por participante, sem baixar os outros cartões. Trocar de tela encerra tracks e peers anteriores.
- Compartilhar e assistir independentes, inclusive dois publicadores assistindo um ao outro.
- Interface com cartões, destaque, prévia própria e controles de moderação por participante. Qualidade e diagnóstico ficam em painéis recolhíveis.
- Prévia própria pausada e sem stream no player em segundo plano. A captura enviada permanece com as mesmas tracks e configurações.
- Áudio recebido inicialmente silenciado e bloqueado enquanto a pessoa captura som do computador, evitando recaptura dentro do Discorja. Microfone/câmera continuam negados.
- Protocolo 3 com autorização por publicação e seleção, confirmação antes de negociar a nova recepção e reconexão da mesma seleção. Protocolos antigos permanecem em salas separadas no servidor.
- Fila limitada para enumerar fontes sem reaproveitar a lista antiga ao cancelar/reabrir rapidamente. Contadores associados a publicações e membros removidos são limpos.
- Diagnóstico administrativo `server:check` e guia de operação da 0.8-A, sem nova dependência ou contratação.

## Verificações

| Verificação                        | Resultado                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `npm test`                         | 131 testes aprovados, 14 arquivos.                                                                                      |
| `npm run typecheck`                | Aprovado.                                                                                                               |
| `npm run format:check`             | Aprovado.                                                                                                               |
| `npm run build`                    | Aprovado, aplicativo e servidor.                                                                                        |
| `npm run test:multistream`         | Oito cenários integrados aprovados com quatro instâncias, duas capturas e mídia WebRTC local real.                      |
| `npm run test:e2e`                 | Vinte cenários aprovados: perfis, exportação, recuperação, prévia, fullscreen, limites, saída e controles de segurança. |
| `npm run test:audio`               | Dezesseis cenários aprovados com áudio de uma janela sintética; não é certificação de WASAPI/Discord.                   |
| `npm run test:rooms`               | Dez cenários aprovados: troca, isolamento, moderação, convites e limpeza.                                               |
| `npm audit --audit-level=moderate` | Zero vulnerabilidades conhecidas informadas pelo registro no momento da consulta.                                       |

O ensaio de várias telas confere ausência de peers antes de escolher uma tela, troca com encerramento da recepção anterior, publicadores assistindo um ao outro, minimização, parada individual, interrupção por moderação, parada de recepção e fechamento da sala. Não captura monitores nem janelas pessoais; somente a janela sintética preparada pelo teste.

Os testes do servidor cobrem autoassinatura, acesso entre salas, oferta de quem apenas assiste, IDs obsoletos, limite de publicações, interrupção durante desconexão, token rotacionado e retomada negada após remoção. Os testes do diagnóstico verificam saúde/protocolo, servidor antigo, estatísticas e URLs inseguras; não são teste de invasão do host.

Houve uma falha real no ensaio de cancelamento rápido: a segunda enumeração podia reutilizar o pedido anterior do Electron e mostrar uma lista sem a janela recém-aberta. A enumeração foi serializada com no máximo dois pedidos pendentes. O ensaio completo passou depois do ajuste. A seleção automatizada usa o identificador nativo da janela sintética para evitar depender do título.

## Prévia e consumo observado

No ensaio com quatro instâncias, o receptor decodificou **177 quadros no intervalo de teste após minimizar o publicador**. A prévia própria ficou pausada e com `srcObject === null`; a track continuou `live`, habilitada e com as mesmas constraints, incluindo máximo de 60 FPS. Ao restaurar a janela, a prévia recebeu o mesmo objeto de stream.

A minimização e restauração foram executadas na janela nativa real. O roteamento dos eventos `blur` e `focus` foi exercitado com eventos emitidos no processo principal: a área de trabalho automatizada não transferiu foco de forma confiável por chamadas programáticas. **Alt-Tab real e comportamento em outras máquinas ficam para o piloto manual.** A unidade do player também verifica que pausar não chama `stop` nem `applyConstraints` na captura.

| Memória do renderer medido                       | Antes de minimizar | Durante minimização |
| ------------------------------------------------ | ------------------ | ------------------- |
| `workingSetSize` informado pelo Electron, em KiB | 199832             | 203676              |
| `privateBytes` informado pelo Electron, em KiB   | 141880             | 143700              |

Essa amostra **não comprovou redução de RAM**. A mudança evita reprodução da própria prévia, mas captura, codificadores, recepção escolhida e caches continuam alocando memória. Não anunciar porcentagens de economia nem confundir reprodução local a 0 FPS com captura/transmissão parada.

## Qualidade efetivamente recebida

Amostras curtas do ensaio de vídeo na mesma máquina, com codificação/decodificação por software informadas pelo ambiente:

| Perfil solicitado e cenário                | Resolução recebida observada    | FPS medidos aproximados |
| ------------------------------------------ | ------------------------------- | ----------------------- |
| 1080p/60, movimento, fase inicial          | 412 × 222                       | 59,8                    |
| 1080p/30, movimento                        | 412 × 222                       | 29,5                    |
| 1080p/30, detalhes                         | 1920 × 1032                     | 29,9                    |
| 720p/30                                    | 1280 × 688                      | 30,1                    |
| 1080p/60, publicador minimizado            | 1920 × 1032                     | 54,9                    |
| Dois receptores, orçamento total de 4 Mbps | 412 × 222 no receptor amostrado | 59,5                    |

A janela nativa de teste ficou em 1920 × 1032 pela área disponível do Windows. As fases mostram que pedir 1080p/60 **não garante entrega dessa resolução a 60 FPS**; houve redução de resolução nas fases de movimento e orçamento baixo. Não são resultados de computadores/redes distintos nem uma medição sustentada. Os testes verificam limites e continuidade, sem certificar a qualidade final do grupo.

Relatórios e imagens ficam em `test-results/`, ignorado pelo Git: `multistream-smoke.json`, `smoke.json`, `audio-smoke.json`, `rooms-smoke.json`, `multistream-room.png` e `multistream-viewer.png`. Não publicar perfis locais ou diagnósticos que contenham dados pessoais.

## Configuração e pendências

1. Implantar primeiro o servidor compatível com protocolo 3. Usar `MAX_PUBLISHERS=2` e `MAX_VIEWERS=4` no piloto. Quatro publicações são apenas um teto aceito pela configuração, ainda sem capacidade comprovada.
2. Conferir WSS/TLS, `ALLOWED_ORIGINS`, processo sem privilégios e limites do host real. Dockerfile/contexto foram ajustados para incluir o diagnóstico e seu módulo puro de configuração, mas não houve build/execução Docker neste ambiente.
3. Distribuir os clientes 0.7.0 pelo fluxo existente de GitHub Releases. Assinatura continua opcional; configuração e atualização entre duas instalações não foram verificadas nesta entrega.
4. Executar o roteiro de [operacao.md](operacao.md): redes distintas, grupo real, sessão de pelo menos 30 minutos, Alt-Tab e medição de CPU/GPU/RAM, resolução/FPS recebidos, perda e latência.
5. Validar captura nativa de áudio, dispositivos e uso com Discord. O som do computador pode incluir a chamada; não há isolamento por janela comprovado.
6. Conferir as contas e cotas gratuitas realmente usadas; não foi habilitada cobrança ou contratado serviço. A sinalização não precisa retransmitir mídia, mas deve estar acessível durante o uso.

A 0.8-A começou pelo diagnóstico e roteiro; permanece em andamento até a homologação externa. O resultado local não é uma certificação de segurança, capacidade ou release estável.
