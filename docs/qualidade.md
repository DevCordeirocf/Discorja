# Qualidade de vídeo e estabilidade

O objetivo é manter uma transmissão utilizável quando a rede ou o computador não sustentam a qualidade escolhida. A seleção de 1080p/60 FPS representa um teto solicitado; a qualidade recebida depende da fonte, da codificação, do caminho de rede e do computador de cada espectador.

Os resultados e limites da execução desta versão estão em [validação local da versão 0.2.0](validacao-0.2.0.md), incluindo as medidas recebidas e os cenários ainda pendentes.

## Perfis e orçamento de envio

| Perfil         | Resolução e FPS solicitados | Teto inicial por espectador | Uso sugerido                                            |
| -------------- | --------------------------- | --------------------------- | ------------------------------------------------------- |
| 720p · 30 FPS  | 1280 × 720, até 30 FPS      | 4 Mbps                      | Ponto inicial com menor carga.                          |
| 1080p · 30 FPS | 1920 × 1080, até 30 FPS     | 8 Mbps                      | Texto, código e apresentações com mais detalhe.         |
| 1080p · 60 FPS | 1920 × 1080, até 60 FPS     | 12 Mbps                     | Movimento, quando fonte, computador e rede sustentarem. |

Esses valores são decisões do Discorja, não requisitos mínimos universais de banda. O padrão é 720p/30 FPS, conteúdo com detalhes e adaptação habilitada. O orçamento total padrão é 40 Mbps, editável entre 4 e 100 Mbps; ele deve caber no upload disponível, com folga para o restante da conexão.

O aplicativo solicita para cada envio o menor teto entre o perfil e sua parcela do orçamento total. Com quatro espectadores em 1080p/60 FPS e orçamento de 40 Mbps, a parcela inicial é de até 10 Mbps por pessoa, em vez de quatro envios de 12 Mbps. A adaptação pode reduzir cada envio abaixo dessa parcela. O orçamento não mede a velocidade contratada e não reserva banda no roteador.

Os controles são aplicados com `RTCRtpSender.setParameters()`. Se o navegador não aceitar os parâmetros, o aplicativo informa a limitação e mantém a transmissão; confira a taxa medida. O perfil pode ser alterado ao vivo. Quando o sistema rejeita uma mudança de captura, o aplicativo tenta restaurar o perfil anterior e informa a falha.

`maxBitrate` limita a taxa da mídia sem contabilizar toda a camada de transporte. O consumo real da conexão também envolve cabeçalhos, controle e retransmissões; um teto de vídeo não é uma garantia do total medido na placa de rede. Consulte a [definição de `maxBitrate` no WebRTC](https://www.w3.org/TR/webrtc/#dom-rtcrtpencodingparameters-maxbitrate).

## Detalhes ou movimento

Use **Textos e detalhes** para ler texto e preservar contornos; use **Vídeos e jogos** quando a fluidez for mais importante. O aplicativo comunica essa preferência ao codificador e usa uma sequência de redução coerente com ela: detalhes reduz primeiro FPS; movimento reduz primeiro resolução. As [indicações de conteúdo do W3C](https://www.w3.org/TR/mst-content-hint/#video-content-hints) descrevem essa troca entre nitidez e fluidez. Elas orientam o navegador; não garantem legibilidade ou uma taxa fixa.

Uma fonte pequena não ganha detalhes reais ao escolher 1080p. Para avaliar 1080p/60, use conteúdo com área nativa suficiente, movimento contínuo e atualização compatível. Uma janela parada pode gerar poucos quadros novos sem haver travamento. Uma fonte a 30 FPS, uma janela com atualização limitada ou falta de recursos de codificação impede 60 FPS efetivos.

1080p/60 processa aproximadamente 4,5 vezes mais pixels por segundo que 720p/30, antes das diferenças de codec e de conteúdo. Isso não significa uma multiplicação exata do uso de CPU, mas explica por que aumentar qualidade afeta captura, escala, codificação e decodificação, além da rede.

## Controle por espectador

Nos primeiros dez segundos de observação, o controle adicional aguarda a estimativa inicial da conexão. O controle nativo de congestionamento continua ativo nesse período. Isso evita somar uma redução prematura do aplicativo à redução inicial do navegador. Conexões que esgotam as tentativas de recuperação liberam seu encoder e deixam de reservar a parcela de upload dos espectadores que continuam assistindo.

A captura é compartilhada, mas cada espectador tem uma conexão e um controlador de envio próprios. O orçamento é dividido entre os envios; os sinais de problema de uma conexão reduzem aquele envio. Um amigo em Wi-Fi ruim não deve, por esse motivo isolado, alterar a resolução de captura para os demais.

A coleta ocorre aproximadamente a cada dois segundos, sem sobrepor rodadas. A adaptação considera limitações sustentadas de CPU/banda e perda de pacotes: são necessárias três amostras ruins para reduzir um nível, quinze boas para recuperar e pelo menos dez segundos entre mudanças. Essa histerese evita trocar de nível a cada oscilação. FPS baixo em uma tela estática não é tratado, sozinho, como congestionamento. Desabilitar **Ajustar à conexão** mantém o controle normal de congestionamento do WebRTC; não força a rede a entregar o perfil escolhido.

Reduzir um envio pode aliviar seu codificador. Se a captura ou o computador inteiro continuar sobrecarregado, a solução prática é diminuir o perfil ou o número de espectadores. A divisão do orçamento não elimina o trabalho de manter várias conexões.

Quando a conexão de mídia cai, o anfitrião tenta renegociar ICE até duas vezes por interrupção, com espera entre tentativas. Uma desconexão breve tem uma janela de oito segundos antes de iniciar essa recuperação; uma falha declarada pode iniciá-la antes. O contador é reiniciado quando a conexão se recupera. Recuperação de ICE depende de a sinalização continuar disponível e de existir um caminho de rede utilizável; ela não recupera uma sala encerrada nem resolve uma rede sem conectividade. O mecanismo é baseado na [renegociação ICE do WebRTC](https://www.w3.org/TR/webrtc/#dom-rtcpeerconnection-restartice).

## Medir o que chegou

No espectador, resolução e FPS devem vir das estatísticas do vídeo recebido, não do perfil selecionado pelo anfitrião. No anfitrião, estatísticas de envio descrevem o que saiu daquela conexão; a prévia local descreve a captura. Nenhuma dessas duas medidas comprova sozinha o que foi exibido no outro computador.

As métricas de `getStats()` distinguem vídeo enviado/decodificado, perda, RTT, limitação de qualidade e caminho ICE. RTT é o tempo de ida e volta da conexão, não a latência completa entre captura e exibição. Campos podem estar ausentes; ausência deve aparecer como indisponibilidade, sem inventar um valor. Para diagnósticos futuros, `freezeCount`, tempo de codificação e informações do codificador ajudam a separar rede, processamento e travamentos. Alguns dados de hardware podem ser omitidos. Veja as [estatísticas padronizadas pelo W3C](https://www.w3.org/TR/webrtc-stats/).

A coleta e as atualizações da interface devem ser leves e preservar o elemento de vídeo durante a reprodução. Trocar o elemento ou sua fonte a cada atualização de métricas pode interromper reprodução e tela cheia. A orientação do Electron é medir os gargalos e evitar bloquear os processos principal e de interface; isso motiva manter operações pesadas fora desses caminhos. Veja [desempenho no Electron](https://www.electronjs.org/docs/latest/tutorial/performance).

## Prioridades e estado

“Implementado” descreve o comportamento do código; não comprova desempenho em qualquer computador ou rede. Os resultados de cada execução local ficam nos relatórios de `test-results/`.

| Prioridade | Medida                                                       | Estado e alcance                                                                                       |
| ---------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| P0         | Perfis, preferência de conteúdo e orçamento total            | Implementado no cliente; limites solicitados ao navegador.                                             |
| P0         | Redução por espectador e recuperação com histerese           | Implementado; precisa de validação prolongada em redes reais.                                          |
| P0         | Métricas de envio e recepção                                 | Implementado; valores disponíveis dependem do Chromium e da conexão.                                   |
| P0         | Preservação do vídeo e recuperação ICE limitada              | Implementado; não substitui reconexão à sala quando a sinalização encerra.                             |
| P0         | Manter o aplicativo ativo em segundo plano durante a captura | Implementado no anfitrião; não obriga a janela de origem a produzir quadros quando o sistema a limita. |
| P1         | Teste integrado de captura e recepção WebRTC local           | Roteiro automatizado disponível; consulte o relatório da execução atual.                               |
| P1         | Quatro espectadores físicos, Wi-Fi degradado e TURN          | Validação pendente no ambiente real.                                                                   |
| P1         | Medição sustentada de 1080p/60, CPU/GPU e temperatura        | Validação pendente; escolher o perfil não comprova 60 FPS.                                             |
| P2         | Comparação de codecs e caminho de captura nativo             | Proposta futura, condicionada a medições.                                                              |
| P2         | SFU para reduzir o envio repetido pelo anfitrião             | Proposta futura; requer infraestrutura de mídia.                                                       |

## Alternativas quando os limites aparecerem

**Codec e aceleração:** compare os codecs realmente negociados e os dados do codificador, quando expostos, antes de fixar uma preferência. Aceleração da interface por GPU não comprova codificação de vídeo por hardware. O melhor codec depende dos dois computadores, do driver, do conteúdo e da rede. Não há promessa de que forçar H.264, VP9 ou AV1 resolverá o gargalo.

**Captura nativa especializada:** Windows Graphics Capture e Desktop Duplication são alternativas para um backend próprio. Antes de trocar a captura do Electron, meça se o custo está em obter os quadros, copiá-los, escalá-los ou codificá-los. Uma implementação nativa acrescenta integração e manutenção; não elimina upload nem decodificação no espectador. Referências: [captura de tela no Windows](https://learn.microsoft.com/en-us/windows/apps/develop/media-authoring-processing/screen-capture) e [Desktop Duplication](https://learn.microsoft.com/en-us/windows/win32/direct3ddxgi/desktop-dup-api).

**TURN:** melhora a chance de existir um caminho entre os computadores. Continua havendo um envio por espectador e o servidor de relay acrescenta tráfego e um percurso de rede; a imagem não fica automaticamente mais nítida ou fluida. É uma decisão de conectividade, que deve ser testada com a carga real.

**SFU:** o anfitrião poderia enviar uma representação, ou algumas camadas, ao servidor, que encaminharia a mídia aos espectadores. Isso reduz a repetição de upload no anfitrião e pode reduzir seu trabalho de codificação; simulcast adiciona camadas e não torna esse custo zero. A banda de saída passa a ser responsabilidade do servidor. Esse desenho exige operação, controle de acesso e revisão de privacidade. A distinção entre envio em malha e encaminhamento seletivo está na [RFC 7667, topologias RTP](https://www.rfc-editor.org/rfc/rfc7667.html#section-3.7); sua aplicação ao Discorja é uma proposta de arquitetura.

## Matriz prática de validação

Execute primeiro com um espectador para obter uma referência e repita com quatro computadores espectadores. Use ao menos alguns minutos por condição, incluindo um trecho de carga sustentada; registre perfil, modo, orçamento, resolução/FPS recebidos, taxa por conexão, perda e RTT. Registre também uso de CPU/GPU e travamentos quando houver ferramentas disponíveis. Não grave conteúdo privado para montar o diagnóstico.

| Cenário                                 | Configuração a comparar                            | O que observar                                                                                 |
| --------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Texto pequeno e rolagem                 | 720p/30 e 1080p/30, detalhes                       | Legibilidade, resolução recebida e comportamento durante a rolagem.                            |
| Movimento contínuo                      | 1080p/30 e 1080p/60, movimento                     | FPS recebido sustentado, quadros perdidos e custo nos dois computadores.                       |
| Um Wi-Fi ruim entre quatro espectadores | Mesmo perfil e orçamento para todos                | Adaptação daquele envio, continuidade dos demais e recuperação sem alternância constante.      |
| Upload compartilhado com outra tarefa   | Orçamento abaixo da capacidade disponível          | Atraso, perda e estabilização com adaptação ligada/desligada; total real da interface de rede. |
| Rede que exige TURN                     | Confirmar candidato `relay` no caminho selecionado | Recepção real, qualidade sustentada, RTT e tráfego no relay.                                   |
| Queda breve da conexão                  | Interromper e restaurar apenas o caminho de teste  | Tentativas de ICE limitadas, recuperação ou mensagem de falha e saída limpa.                   |
| Parar, reiniciar e trocar o perfil      | Repetir com espectadores conectados                | Captura autorizada, novas métricas coerentes e ausência de vídeos ou timers antigos.           |

O teste local com Electron valida partes do fluxo e das regras automáticas. Várias instâncias no mesmo computador concentram captura, codificação e decodificação numa única máquina, uma carga diferente de espectadores em computadores separados. Perda e latência artificiais em testes controlados ajudam a verificar decisões, mas não reproduzem todo Wi-Fi, roteador, operadora ou hardware. Os resultados não constituem uma garantia de qualidade pela internet nem uma certificação de 1080p/60 em GPU.
