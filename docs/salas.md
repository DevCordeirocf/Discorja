# Salas, participantes e permissões

## Versão 0.7.0: várias telas, uma recepção por pessoa

Qualquer participante pode selecionar uma janela e iniciar sua própria captura enquanto houver espaço. O piloto permite **duas telas simultâneas**, uma por pessoa, e **dez participantes totais**. Entrar na sala não recebe vídeo automaticamente: escolha **Assistir** no cartão da pessoa desejada. Os cartões contêm somente informações, sem vídeos ou recepções ocultas.

Você pode compartilhar e assistir à tela de outra pessoa ao mesmo tempo. A prévia da própria captura fica ao lado do destaque. Trocar a tela escolhida fecha os peers e tracks de recepção anteriores, mantendo somente uma transmissão recebida. **Parar de assistir** libera essa recepção; **Parar de compartilhar** encerra apenas sua publicação. Outras telas e seus espectadores continuam.

Ao perder o foco ou minimizar, a prévia local pausa e solta a referência do player ao stream, com reprodução a **0 FPS**. A track de captura permanece ativa e com as mesmas configurações para o envio. Ao voltar, a prévia reutiliza essa captura. Isso reduz trabalho de reprodução local; não garante queda imediata de RAM, pois captura, codificador e recepção escolhida ainda têm buffers próprios.

O som da tela escolhida começa silenciado. Se você captura o áudio do computador, ouvir outra transmissão dentro do Discorja fica bloqueado enquanto essa track existir, inclusive com envio silenciado. Use **Encerrar captura de som** para poder ouvir; isso evita recaptura e realimentação dentro do aplicativo. O som geral do Windows ainda pode incluir o Discord.

O dono concede moderação pelo menu **···** de cada pessoa. Dono e moderadores podem encerrar uma publicação individual; participantes podem encerrar somente a própria. A regra de remoção continua: moderadores não expulsam dono ou outro moderador. Somente o dono encerra a sala inteira; a saída definitiva dele continua fechando a sala para todos.

### Configurar e migrar

1. Atualize o servidor antes dos aplicativos. Reiniciar o processo fecha as salas em memória.
2. Mantenha `MAX_PUBLISHERS=2` no ambiente do servidor. O intervalo aceito é 1 a 4, sem ultrapassar `MAX_VIEWERS + 1`; quatro telas ainda precisam de medição representativa. Essa variável é um limite, não uma garantia de capacidade.
3. `MAX_VIEWERS=9` representa nove vagas além do criador: dez participantes totais, independentemente de quem transmite. O servidor recusa valores maiores. Cada participante recebe no máximo uma tela.
4. Distribua clientes 0.7.0 e crie novas salas. Elas usam o **protocolo 3**, com publicação e seleção independentes. Protocolos 1 e 2 permanecem no servidor em salas separadas; não se misturam na mesma sala.
5. Confira WSS e `ALLOWED_ORIGINS=app://discorja` no servidor de produção. Não inclua `STATS_TOKEN` nem credenciais administrativas nos clientes. O diagnóstico de [operação](operacao.md) verifica saúde e compatibilidade.

O tráfego de mídia continua P2P: cada publicador envia somente para quem escolheu sua tela. Duas publicações não obrigam cada pessoa a baixar duas telas. Os limites de upload e a adaptação por espectador continuam independentes em cada computador que publica. A SFU segue adiada, sem infraestrutura adicional paga.

Os testes atuais incluem `npm run test:multistream`, além dos ensaios de vídeo, áudio e salas. Resultados e limitações em [validacao-0.7.0.md](validacao-0.7.0.md).

## Referência histórica: versão 0.5.0, protocolo 2

As regras abaixo descrevem o modelo anterior, mantido apenas para clientes antigos em suas próprias salas. Na 0.7.0 valem as regras de várias telas acima; o controle **Permitir tela** foi substituído pela publicação individual.

## Como usar

1. Configure o mesmo servidor nos aplicativos e informe seu nome na página inicial.
2. Crie uma sala normalmente ou abra **Salas**, informe um nome e escolha **Criar outra sala**.
3. Compartilhe o código com o grupo. Cada pessoa entra pelo código no início ou no painel **Salas**.
4. Em **Salas**, os convites recentes do servidor atual ficam disponíveis para uma nova entrada. A disponibilidade só é verificada ao entrar.
5. Para alternar enquanto está conectado, selecione um convite ou crie outra sala e confirme **Trocar de sala**. Cancelar mantém a sessão atual.

Há **uma sala de mídia ativa por aplicativo**. Ao confirmar uma troca, o Discorja encerra as tracks de áudio/vídeo, fecha as conexões WebRTC e a sinalização anteriores e só então tenta conectar à próxima sala. As outras salas salvas não abrem sockets nem recebem mídia em segundo plano. O resultado é eliminar as conexões de mídia anteriores, em vez de manter vídeos ocultos consumindo banda.

Se a nova sala não existir, estiver cheia ou a rede falhar, a sessão anterior já terá sido encerrada. Não há retorno automático nem reinício de captura; escolha uma sala novamente. Essa consequência aparece antes da confirmação.

## Quem pode fazer o quê

Os papéis de administração e transmissão são independentes. O criador começa como dono e participante autorizado a transmitir. Há **um transmissor autorizado por sala**, mesmo que ainda não tenha iniciado uma tela. Várias telas simultâneas continuam na etapa 0.7.

| Ação                          | Dono                                    | Moderador                                        | Participante                            |
| ----------------------------- | --------------------------------------- | ------------------------------------------------ | --------------------------------------- |
| Escolher quem pode transmitir | Sim                                     | Sim                                              | Não                                     |
| Iniciar captura               | Somente se for o transmissor autorizado | Somente se for o transmissor autorizado          | Somente se for o transmissor autorizado |
| Conceder ou retirar moderação | Sim                                     | Não                                              | Não                                     |
| Remover participantes         | Sim, exceto a si próprio                | Sim, exceto dono, outro moderador e a si próprio | Não                                     |
| Encerrar a sala               | Sim                                     | Não                                              | Não                                     |
| Sair ou trocar sua sala       | Sim; encerra a sala para todos          | Sim                                              | Sim                                     |
| Ajustar seu volume recebido   | Sim, quando espectador                  | Sim, quando espectador                           | Sim, quando espectador                  |

O dono usa **Moderar** para conceder o papel e **Retirar moderação** para revogá-lo. O servidor é a autoridade: esconder um botão não é o mecanismo de proteção. Solicitações com IDs de outra sala, papel inventado, ofertas de um participante não autorizado ou tentativa de remover o dono são recusadas.

## Trocar quem transmite

O dono ou moderador escolhe **Permitir tela** na pessoa desejada. Isso revoga a permissão anterior e encerra a transmissão existente. O novo transmissor recebe o botão para escolher sua janela, mas **a captura não começa automaticamente**. Ele precisa selecionar a fonte, escolher se inclui som e iniciar.

Se o transmissor sair ou for removido, a permissão volta ao dono com a publicação parada. O dono precisa iniciar sua própria captura. Remover alguém também invalida seu token de retomada daquela sessão; a pessoa ainda pode entrar novamente pelo convite válido. Não há bloqueio permanente de identidade.

## Saída, queda e expiração

- O dono sair, trocar de sala ou encerrar a sala fecha essa sala para todos, inclusive se outra pessoa estiver transmitindo. Não há transferência automática de propriedade nesta versão.
- Um moderador não mantém uma sala aberta depois da saída definitiva do dono. Sua permissão administrativa vale enquanto for membro dela.
- Uma perda temporária de sinalização usa o período de retomada já configurado no servidor. O servidor conserva os papéis e só aceita o token de uma sessão desconectada e ainda válida. O token é rotacionado ao retomar.
- A retomada reutiliza somente captura ainda autorizada; mudança de transmissor durante a desconexão revoga a captura anterior. Sair ou ser removido invalida a retomada.
- As salas continuam em memória. Reinício do servidor e expiração encerram os convites; o histórico local não recria uma sala.

O aplicativo guarda até doze convites recentes, com nome, código e servidor. Não guarda tokens de retomada no histórico. Os convites são filtrados pelo endpoint atual e podem ser esquecidos pelo botão ao lado de cada entrada. Não há consulta pública de todas as salas nem conta de usuário.

## Atualizar aplicativo e servidor

A 0.5.0 usa o **protocolo de salas 2**, confirmado antes da entrada por `hello`. O aplicativo mostra orientação para atualizar se o servidor não reconhecer essa versão.

1. Implante primeiro o servidor do código 0.5.0, usando o procedimento de [implantação](implantacao.md). Não há variável obrigatória nova.
2. Confira `/health`, WSS, `ALLOWED_ORIGINS` e os limites existentes.
3. Distribua o aplicativo 0.5.0 ao grupo e crie novas salas nele.
4. Não tente entrar em uma sala antiga com o cliente novo. O servidor recusa misturar protocolos na mesma sala e explica a incompatibilidade.

O servidor 0.5.0 conserva o protocolo anterior para os aplicativos 0.3/0.4 continuarem em suas próprias salas durante a transição. Esses clientes mantêm o modelo anterior de anfitrião único. O protocolo 2 tem snapshots com dono, transmissor e participantes; cada conexão recebe apenas seu próprio token de retomada. Atualizar o servidor normalmente reinicia o processo e encerra as salas em memória; avise o grupo antes da implantação.

O limite padrão atual é **dez participantes totais**: o criador e até nove receptores. `MAX_VIEWERS` limita receptores independentemente de quem é dono e aceita no máximo `9`. Em `/api/stats`, a contagem de publicadores informados acompanha o transmissor atual e não o proprietário.

## Validação local

```powershell
npm run build
npm test
npm run test:e2e
npm run test:audio
npm run test:rooms
```

O ensaio de salas abre quatro instâncias locais e captura somente uma janela de teste própria. Confere fechamento das conexões anteriores, encerramento das tracks, permanência dos outros espectadores, mudança de transmissor, moderação, convites recentes e falha na sala de destino. Relatórios em `test-results/`, fora do Git.

Não é uma medição de banda na interface física da rede nem uma certificação de carga em computadores diferentes. O ensaio usa estados e conexões WebRTC reais para verificar a liberação de recursos. Resultados e pendências em [validacao-0.5.0.md](validacao-0.5.0.md).
