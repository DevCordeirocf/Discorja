# Validação local — Discorja 0.2.0

Execução em Windows, em 14 de outubro de 2026, com Electron 44.7.2. O teste abriu um anfitrião e dois espectadores no mesmo computador, com sinalização local e STUN/TURN externos desativados. A captura foi exclusivamente de uma janela animada criada pelo roteiro.

## Verificações concluídas

- 55 testes automatizados passaram: salas, permissões, preferências, divisão de upload, adaptação, dados ausentes/em cache, contadores reiniciados, serialização de parâmetros, recuperação ICE e descarte de operações antigas.
- Typecheck e formatação passaram.
- O executável empacotado passou em 15 cenários integrados, sem erros de JavaScript no renderer. Incluem os três perfis, troca ao vivo, preservação do vídeo, execução com o anfitrião minimizado, tela cheia, parada/reinício, segundo espectador, divisão de orçamento, remoção e encerramento.

O instalador local foi gerado sem assinatura. A aplicação empacotada foi executada diretamente da pasta `release/win-unpacked`; o assistente de instalação e atualizações assinadas não foram exercitados.

## Amostras recebidas no executável empacotado

Cada amostra dos perfis principais cobriu aproximadamente 4,5 segundos, após uma espera inicial de 12 segundos. FPS e Mbps abaixo são calculados a partir de deltas de quadros decodificados e bytes recebidos. A taxa varia com o conteúdo; estes valores não definem requisitos universais de banda.

| Perfil solicitado              | Modo      | Resolução recebida ao fim da amostra | FPS médio | Vídeo recebido |
| ------------------------------ | --------- | ------------------------------------ | --------- | -------------- |
| 1080p/60                       | Movimento | 1920 × 1032                          | 59,1      | 4,85 Mbps      |
| 1080p/30                       | Movimento | 1920 × 1032                          | 29,7      | 4,34 Mbps      |
| 1080p/30                       | Detalhes  | 1920 × 1032                          | 30,1      | 1,72 Mbps      |
| 720p/30                        | Movimento | 1280 × 688                           | 29,9      | 3,12 Mbps      |
| 1080p/60, anfitrião minimizado | Movimento | 1920 × 1032                          | 56,0      | 6,69 Mbps      |

A janela de teste ficou com **1920 × 1032** pixels de conteúdo devido à área disponível do desktop. O aplicativo preservou essa proporção: estes resultados **não comprovam 1920 × 1080 a 60 FPS sustentados**. A amostra com o anfitrião minimizado durou aproximadamente três segundos. Não houve perda de pacotes nem congelamentos reportados nessas amostras curtas.

O codec observado foi VP8 e o encoder informou `libvpx`, com `powerEfficientEncoder=false`. Isso não é uma comparação entre codecs nem comprova desempenho de codificação por GPU. Rodar captura, dois encoders e decodificação no mesmo computador também difere do uso em computadores separados.

## Limite de upload e condições difíceis

Com dois espectadores e orçamento total de 4 Mbps, ambos os senders confirmaram tetos de 2 Mbps. Na amostra curta de 2,5 segundos, após um reinício da transmissão, um receptor mostrou 236 × 127 a 59,5 FPS. A leitura comprova a aplicação do orçamento e uma queda real de resolução; **não comprova boa qualidade nesse orçamento nem uma resolução estabilizada**. Priorizar FPS com pouca banda pode produzir uma imagem muito pequena. Para leitura de texto, o modo Detalhes e um perfil de 30 FPS são pontos de comparação mais adequados.

Durante a integração também foi solicitada emulação P2P de 12% de perda pelo Chromium. O receptor continuou reportando 0% de perda no intervalo observado. Portanto essa execução **não é tratada como validação de perda de 12%**. A regra de adaptação por perda tem cobertura automatizada com estatísticas controladas; Wi-Fi degradado, TURN e interrupção física de rede permanecem na matriz de testes reais.

## Reproduzir e interpretar

```powershell
npm ci
npm run typecheck
npm test
npm run dist:win -- --publish never
npm run test:e2e -- --packaged
```

O relatório completo de cada execução fica em `test-results/smoke-packaged.json`, incluindo `qualityPhases`, os parâmetros dos senders e as medidas observadas. As capturas dos controles e do diagnóstico ficam em `test-results/quality-controls.png` e `test-results/quality-diagnostics.png`. Esses arquivos são locais e não entram no Git.

Antes de afirmar suporte sustentado a 1080p/60, ainda é necessário repetir o ensaio com fonte nativa 1920 × 1080, computadores separados, sessão prolongada, um e quatro espectadores, redes diferentes e TURN quando necessário. Consulte a [análise de qualidade e otimização](qualidade.md) para prioridades, alternativas e a matriz completa.

## Revisão da configuração de distribuição — 15 de outubro de 2026

A revisão para a documentação corrigiu o local do publicador na configuração do electron-builder v26 (`win.signtoolOptions.publisherName`) e removeu a aceitação de `CSC_NAME` como alternativa Windows. O fluxo padrão usa `CSC_LINK`.

Oito testes adicionais verificaram as configurações local e assinada contra o schema instalado, a geração dos metadados e a rejeição de configuração incompleta, usando diretórios temporários e credenciais fictícias. A suíte passou com **63 testes**, e a verificação de tipos passou. Não houve assinatura nem publicação real. Os cenários e amostras de mídia registrados acima pertencem à execução anterior; esta revisão não representa uma nova medição de transmissão nem validação da atualização instalada.
