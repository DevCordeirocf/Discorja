# Validação da versão 0.4.0

Data: 15 de outubro de 2026. Escopo: **0.4-A e 0.4-B**, solicitadas em conjunto. Implementação de áudio e documentação preparadas localmente; a validação operacional completa exige os ensaios manuais abaixo. Não foram iniciadas as salas da 0.5.0.

## Entrega

- Escolha explícita de áudio por captura, desligada por padrão, com aviso e confirmação de alcance.
- Autorização de uso único por quinze segundos, com revogação durante consultas assíncronas. Som apenas por `getDisplayMedia`; câmera e microfone continuam negados.
- Vídeo e áudio na mesma conexão/stream, inclusive recepção de tracks sem identificador de stream.
- Silenciar/reativar envio, encerrar somente áudio, volume e ativação de som no espectador. Prévia local sempre silenciada.
- Limite de áudio solicitado, reserva de banda e parâmetros de vídeo preservados se o limite de áudio for recusado.
- Tratamento de silêncio, áudio ausente, fonte encerrada e notificação de mudança de dispositivos, sem abrir outra captura automaticamente.
- Diagnóstico de áudio com exportação por lista de campos permitidos.
- Instruções para uso com Discord e limitações de captura por processo em [audio.md](audio.md).
- Versão do pacote e lockfile atualizadas para 0.4.0. Nenhum novo pacote, serviço ou certificado pago é necessário.

## Verificações locais

- **93 testes automatizados** em nove arquivos aprovados.
- Tipos e compilação desktop/servidor aprovados.
- **20 cenários integrados de vídeo** aprovados: captura real de janela própria, perfis, reconexão, orçamento e limpeza.
- **15 cenários integrados de áudio** aprovados, com **dois minutos adicionais** de transmissão contínua. Validados consentimento, bloqueio de microfone/câmera, som recebido, mute/volume, silêncio, mudança de dispositivo simulada, retomada preservando mute, encerramento de áudio, somente vídeo, faixa ausente, permissão negada, track encerrada e fechamento da sala.
- Formatação e verificação de diferenças aprovadas. Instalador local `release/Discorja-Setup-0.4.0.exe` gerado sem publicação, com blockmap e assinatura opcional não configurada (`NotSigned`). O conteúdo do ASAR confirma a versão 0.4.0, a implementação de áudio e a exclusão dos hooks de teste.

O instalador local desta rodada foi gerado sem `GITHUB_REPOSITORY`, portanto tem atualizações desativadas. Para gerar os artefatos destinados à distribuição com updater, use o workflow existente ou defina `GITHUB_REPOSITORY=DevCordeirocf/Discorja` antes do empacotamento, conforme [releases.md](releases.md). Não publique o instalador local de teste como se tivesse updater configurado. Instalação e execução do executável empacotado não foram validadas nesta rodada.

Os testes unitários cobrem consentimento, expiração, revogação, bloqueio de dispositivos, envio e remoção de áudio sem renegociar vídeo, orçamento, recusa de parâmetros, agregação de tracks e contadores de áudio separados do vídeo.

O teste integrado de áudio utiliza Electron/Chromium, captura de janela, áudio de um frame de teste, WebRTC real e análise da energia do sinal recebido. O ponto de autorização de produção é exercitado, mas seu retorno de áudio é substituído por uma fonte conhecida. Esse procedimento evita capturar áudio pessoal do Windows e **não é uma validação do loopback nativo**.

O relatório local é `test-results/audio-smoke.json`. O parâmetro `--soak-minutes=30` disponibiliza um ensaio prolongado, mas trinta minutos não foram executados nesta entrega. A análise de energia e de avanço dos contadores não certifica sincronização labial. O teste de áudio usa uma entrada exclusiva para instrumentação; a versão exibida pelo anfitrião nesse teste corresponde ao runtime Electron. O cliente normal usa a versão 0.4.0 do pacote.

## Matriz obrigatória antes de anunciar validação completa

| Ensaio                           | Procedimento                                                                                                                                                   | Estado                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Windows 10 e 11: loopback nativo | Instalar o pacote em cada Windows alvo, selecionar som e conferir vídeo/áudio em outro computador. Repetir escolhendo janela e monitor.                        | Pendente em hardware real.                                                                |
| Discord                          | Executar o procedimento de recaptura de voz em `audio.md`; registrar saídas, versão do Windows e resultado. Só anunciar configurações isoladas após aprovação. | Pendente; não há exclusão automática de processos.                                        |
| Sincronização por 30 minutos     | Usar vídeo de teste com batida visual/sonora, observar no receptor no início e a cada cinco minutos; registrar descompasso e crescimento.                      | Pendente com dois computadores.                                                           |
| Dispositivo perdido/trocado      | Alterar saída padrão e desconectar um dispositivo existente; conferir aviso, silêncio ou retomada e ausência de microfone.                                     | Evento simulado coberto; hardware pendente.                                               |
| Vários espectadores e rede       | Repetir com um e quatro espectadores em redes diferentes; conferir orçamento, áudio sem cortes, CPU e vídeo.                                                   | Pendente; P2P e limitações de rede permanecem.                                            |
| Instalador e atualização real    | Instalar 0.4.0 com distribuição configurada, atualizar uma instalação anterior pelo provedor e conferir áudio/configuração preservada.                         | Pacote local de teste gerado; instalação, configuração do updater e publicação pendentes. |

## Configuração necessária

Não há variável adicional de áudio no servidor. Continuar usando o mesmo endpoint WSS, as configurações ICE e as credenciais de publicação já documentadas; o áudio passa pelo WebRTC. O servidor não recebe uma rota HTTP de áudio e não passa a retransmitir mídia por causa desta versão.

Usar aplicativo 0.4.0 nos dois lados para ter todos os controles. O formato das mensagens de sinalização não foi alterado; a negociação de áudio está no SDP existente. Um cliente antigo pode não reproduzir som, pois sua interface foi projetada somente para vídeo. Não anunciar compatibilidade de áudio com clientes antigos sem ensaio.

Para distribuição, gerar/publicar a release 0.4.0 pelo fluxo existente. Assinatura continua opcional. As pendências operacionais de segurança e hospedagem da [0.3.0](validacao-0.3.0.md) permanecem independentes desta implementação.
