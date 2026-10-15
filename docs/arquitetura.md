# Arquitetura e privacidade

O Discorja separa três funções:

| Componente                     | Responsabilidade                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Processo principal do Electron | Janela do aplicativo, captura autorizada, configurações locais e atualizações.                          |
| Interface                      | Criar/entrar em salas, seleção e prévia da captura, controles e conexões WebRTC.                        |
| Sinalização WebSocket          | Criar e expirar salas, controlar participantes e encaminhar negociações entre anfitrião e espectadores. |

O processo principal usa isolamento de contexto e uma ponte de preload com operações específicas. A interface não recebe acesso genérico ao Node.js ou ao sistema de arquivos. A origem de produção do aplicativo é `app://discorja`.

## Ciclo de uma transmissão

1. O anfitrião abre uma conexão com a sinalização e cria uma sala com código aleatório de oito caracteres.
2. O anfitrião escolhe a fonte e inicia a captura. A interface mostra a prévia e o estado da transmissão.
3. Cada espectador entra pelo código. A sinalização encaminha ofertas, respostas e candidatos ICE entre os participantes autorizados.
4. O WebRTC estabelece uma conexão do anfitrião com cada espectador. O vídeo trafega diretamente ou por um TURN configurado nos clientes.
5. Parar a transmissão encerra a captura; fechar a sala invalida o convite e desconecta os espectadores. A sala também termina ao expirar ou perder o anfitrião.

As conexões de mídia WebRTC são criptografadas em trânsito. O serviço de sinalização ainda precisa ser confiável: ele conhece participantes e dados de negociação e controla o encaminhamento dessas mensagens. WSS protege a conexão entre cliente e servidor; não oferece autenticação de identidade dos amigos.

## Qualidade e recuperação

O anfitrião obtém uma captura de vídeo e a envia por uma `RTCPeerConnection` para cada espectador. Os perfis 720p/30, 1080p/30 e 1080p/60 definem limites de captura e de codificação. O orçamento total de vídeo é dividido entre os envios, e cada conexão mantém sua própria adaptação. Uma conexão com problemas não reduz, por esse motivo isolado, a captura compartilhada pelos demais.

O cliente coleta estatísticas de envio e recepção e usa observações sustentadas para reduzir ou recuperar a qualidade com intervalo entre mudanças. A interface preserva o elemento de vídeo ao atualizar o estado. A renegociação ICE tem tentativas limitadas; falha da sinalização ou encerramento da sala exige uma nova entrada, sem restaurar automaticamente um convite invalidado.

Durante a captura, o aplicativo reduz a limitação de atividade em segundo plano no anfitrião. Isso evita depender dos timers normais de uma janela inativa; a taxa de atualização da fonte ainda depende do sistema e do aplicativo capturado.

O servidor continua encaminhando somente sinalização. TURN pode retransmitir uma conexão quando necessário, mas a arquitetura mantém um envio por espectador. Uma futura SFU alteraria o caminho da mídia e a responsabilidade pela banda, pela operação e pela privacidade. Veja [qualidade e estabilidade](qualidade.md) para os limites, prioridades e cenários de validação.

## Dados e acesso

Não há conta, histórico de salas ou gravação automática. As salas são mantidas na memória do servidor. O código funciona como convite enquanto a sala está aberta, e o anfitrião pode remover espectadores. A remoção encerra a conexão atual, mas a pessoa ainda pode entrar novamente com o código. Para revogar esse convite, feche a sala e crie outra. Compartilhe-o apenas com o grupo desejado.

Escolher uma janela ou monitor concede aos participantes acesso ao conteúdo visível naquela fonte. Revise a prévia e feche informações privadas antes de iniciar. Um espectador pode registrar o conteúdo com ferramentas próprias; o aplicativo não consegue impedir isso.

O MVP não inclui aprovação individual de novos participantes, senha adicional, recuperação de sala após reinício, emissão automática de credenciais TURN, múltiplos anfitriões, SFU, câmera ou áudio. A interface mostra o estado da captura e mantém o controle de parar disponível durante a transmissão.

## Referências

- [Captura de tela no Electron](https://www.electronjs.org/docs/latest/api/desktop-capturer)
- [Segurança no Electron](https://www.electronjs.org/docs/latest/tutorial/security)
- [Conexões WebRTC](https://webrtc.org/getting-started/peer-connections)
