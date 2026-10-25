# Som do computador e uso com Discord

## O que o Discorja oferece

O anfitrião pode compartilhar vídeo com o som do computador. O modo padrão captura o loopback geral do Windows. Há também a opção **Excluir o áudio do Discord da transmissão**, que usa a captura nativa por processo do Windows para remover o aplicativo Discord e seus processos filhos, mantendo a call audível localmente. São reconhecidos Discord, Discord PTB e Discord Canary; mantenha apenas uma instância aberta. O microfone continua negado. A câmera é usada apenas para tirar a foto de perfil e não participa do áudio nem da transmissão.

Ao desenvolver ou empacotar no Windows, `npm run audio:build` compila o helper com Visual Studio Build Tools gratuito e a carga **Desenvolvimento para desktop com C++**. `npm run dist:win` e `npm run pack:win` fazem essa compilação automaticamente e incluem o executável no pacote. Quem instala o Discorja não precisa instalar ferramentas de desenvolvimento.

Se aparecer **“A captura filtrada não foi incluída nesta instalação”**, essa cópia do Discorja foi empacotada sem o helper nativo. Instale uma release criada a partir do código que inclui esse recurso. Ao gerar uma release manualmente, use `npm run dist:win`; o workflow do GitHub também verifica se o helper entrou no pacote. Até instalar essa versão, use somente vídeo ou mantenha o áudio desligado.

O modo padrão usa o loopback do Windows autorizado pelo Electron. **Selecionar uma janela limita a imagem, mas não isola seu áudio.** Notificações, navegador e outros programas podem entrar no som capturado. A opção de exclusão substitui o loopback do Electron por um helper nativo WASAPI e exclui a árvore de processos do aplicativo Discord. O helper não grava áudio em arquivo nem altera o volume local. Ele requer Windows 11 ou Windows 10 build 20348 ou superior. Se a API não estiver disponível, o Discorja mostra um erro e continua somente com vídeo; nunca muda silenciosamente para o loopback geral. O retorno da própria prévia fica sempre silenciado.

## Para transmitir

1. Confira a saída padrão de reprodução nas configurações de som do Windows e reproduza um conteúdo conhecido. O dispositivo precisa estar disponível.
2. Crie a sala e clique em **Escolher o que compartilhar**.
3. Selecione a janela ou monitor e, se desejar, marque **Compartilhar som do computador**. A opção começa desmarcada em cada nova captura.
4. Durante uma call no aplicativo Discord, marque **Excluir o áudio do Discord da transmissão**. Você continuará ouvindo as pessoas localmente. Se usar o loopback geral, leia o aviso e confirme o alcance do som antes de iniciar.
5. Clique em **Iniciar compartilhamento**. Peça a um espectador para conferir som e imagem antes de continuar.

| Controle do anfitrião   | Comportamento                                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Silenciar envio de som  | Envia silêncio, mantendo a captura ativa. Pode reativar sem parar o vídeo.                                                                            |
| Encerrar captura de som | Encerra as tracks de áudio e remove o áudio dos emissores. O vídeo continua. Para obter som novamente, pare e inicie outra captura com consentimento. |
| Parar de compartilhar   | Encerra vídeo, áudio e conexões de mídia. A sala fica aberta.                                                                                         |
| Encerrar sala           | Interrompe toda a mídia e desconecta os espectadores.                                                                                                 |

Nenhum controle da sinalização inicia uma captura nova. A retomada de uma sessão apenas reutiliza a captura ainda autorizada, inclusive seu estado silenciado. Não reabre microfone ou dispositivo perdido.

## Para assistir

A recepção começa silenciada. Clique em **Ouvir transmissão** e ajuste **Volume**. **Silenciar recepção** afeta somente seu aplicativo. O volume é preservado nas atualizações da interface e nas reconexões da mesma sala; ao sair, a próxima sala começa silenciada.

Há um único elemento de reprodução para vídeo e som. O navegador cuida dos buffers e da sincronização pelo WebRTC. O aplicativo não reproduz uma segunda cópia do áudio em um elemento separado. Ter uma faixa recebida não significa que exista conteúdo sonoro naquele momento: o programa de origem ou o anfitrião pode estar em silêncio.

## Usar junto ao Discord

| Configuração                                            | Situação nesta entrega                                                                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Discord para voz + Discorja somente vídeo               | Caminho recomendado para continuar conversando sem recapturar a chamada.                                                                       |
| Som do computador sem chamada ou outro áudio indesejado | Modo oferecido; conferir a saída e o conteúdo ouvido pelo espectador.                                                                          |
| Discord para voz + som geral na mesma saída             | Pode devolver as vozes aos espectadores com atraso. Não é uma configuração anunciada como isolada.                                             |
| Discord instalado + opção de exclusão ativada           | Exclui o Discord e seus processos filhos do áudio transmitido, preservando a reprodução local, em versões compatíveis do Windows.              |
| Discord e conteúdo em saídas diferentes                 | Possível experimento com dispositivos já existentes; exige ensaio no Windows alvo. Não considerar isolado apenas por mudar o seletor de saída. |
| Áudio exclusivo de jogo/janela/processo                 | Não implementado. A opção atual exclui somente o aplicativo Discord reconhecido.                                                               |

Fones evitam parte do retorno acústico, mas **não impedem a recaptura digital** do loopback geral. Reduzir o volume recebido também não exclui as vozes do Discord no computador transmissor. Para usar o filtro, todos devem usar o aplicativo Discord instalado, e o computador transmissor precisa de uma versão compatível do Windows. Se houver eco ou o filtro falhar, silencie o envio no Discorja e encerre a captura de som. Continue somente com vídeo.

Para experimentar saídas separadas sem comprar nada, use apenas dispositivos que já possui. No Windows, direcione o conteúdo e o Discord para saídas distintas; os menus variam entre versões. Faça o teste abaixo com os outros aplicativos fechados. Não há garantia de isolamento dessa configuração até conferir o resultado no computador usado. Se não funcionar, mantenha somente vídeo durante a chamada. Drivers, cabos virtuais ou serviços externos não são requisitos desta versão.

### Ensaio antes de usar em uma chamada

1. Use dois computadores. No transmissor, deixe um vídeo de teste com som; o espectador mantém sua recepção do Discorja inicialmente silenciada.
2. Entre na chamada do Discord e peça a outra pessoa da chamada para falar enquanto o vídeo está em silêncio.
3. No espectador, ensurdeça temporariamente o Discord e ative **Ouvir transmissão**. Peça à pessoa que ainda participa da chamada para repetir a frase.
4. Se a fala chegar pelo Discorja, o áudio da chamada está sendo capturado. Essa configuração deve ficar com o som do Discorja desligado.
5. Reproduza o conteúdo de teste e confira se chega uma única vez. Não deixe outra instância do Discorja tocando no transmissor.
6. Repita após mudar saída, reconectar um dispositivo ou reiniciar o programa. Não deduza isolamento de um teste feito em outra máquina.

## Qualidade, consumo e falhas

A captura solicita áudio sem cancelamento de eco, supressão de ruído ou ganho automático, preservando conteúdo de jogos e vídeos. Solicita dois canais e 48 kHz como preferências; o Windows e a negociação podem entregar outro formato. Não há promessa de estéreo ou de áudio sem perdas.

O navegador negocia o formato compatível, normalmente Opus. O limite de envio solicitado é de até **128 kbps por espectador**. O orçamento total reserva 15% para folga e desconta **160 kbps por conexão com áudio** antes de distribuir o restante ao vídeo. O limite é uma solicitação ao navegador, não um medidor físico de upload; se um parâmetro for recusado, o diagnóstico informa a falha e preserva o controle de vídeo.

O diagnóstico apresenta o formato de som e, quando disponíveis, bitrate, jitter, perda, amostras ocultadas e buffer médio de recepção. Jitter mede variação de chegada; buffer médio não é o atraso total nem a diferença entre som e imagem. O arquivo exportado contém métricas, sem amostras de áudio ou nomes de dispositivos.

Se o Windows não fornecer uma faixa de som, o vídeo continua com aviso. Se a solicitação inteira falhar, a transmissão permanece parada; tente novamente sem a opção de som. Mudança de dispositivos mostra orientação para conferir a recepção; não causa nova captura automática. Uma track encerrada é removida do envio sem derrubar a imagem. Silêncio de origem não é tratado como queda de conexão.

## Verificações para desenvolvimento

```powershell
npm run build
npm test
npm run test:audio
# Opcional, com a máquina disponível:
npm run test:audio -- --soak-minutes=30
```

O ensaio integrado abre aplicativos Electron e uma janela própria com som gerado. Usa a autorização real do aplicativo e substitui o retorno de loopback pelo áudio dessa janela **somente no processo de teste**. Não captura o som pessoal do computador e não inclui esse mecanismo no instalador. Resultados ficam em `test-results/audio-smoke.json`, fora do Git.

Esse ensaio valida a negociação, codificação, recepção, controles e limpeza. Não comprova o loopback WASAPI nativo, a troca física de saída nem o uso junto a uma chamada real. A matriz e o procedimento de liberação estão em [validação da 0.4.0](versões/validacao-0.4.0.md).

## Referências

- [Electron: autorização de captura e áudio loopback](https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequesthandlerhandler-opts).
- [Estatísticas WebRTC — W3C](https://www.w3.org/TR/webrtc-stats/).
