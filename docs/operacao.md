# Operação e consolidação — etapa 0.8-A

**Estado:** implementação 0.8.0 concluída localmente, incluindo acessibilidade, diagnóstico de suporte, bitrate ajustável e verificação dos artefatos de atualização. Homologação com o grupo, servidor implantado e atualização entre duas instalações ainda pendentes. Não há serviço pago novo nem SFU nesta entrega. Resultados em [validacao-0.8.0.md](validacao-0.8.0.md).

## O que precisa configurar

| Onde                       | Configuração            | Valor inicial ou ação                                                                                                                                 |
| -------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Servidor                   | Código compatível       | Implantar o servidor 0.8 antes dos clientes; protocolo 3 para as salas novas.                                                                         |
| Servidor                   | Endereço público        | WSS acessível ao grupo e TLS válido, usando o ambiente gratuito já escolhido.                                                                         |
| Servidor                   | `ALLOWED_ORIGINS`       | `app://discorja` em produção.                                                                                                                         |
| Servidor                   | `MAX_VIEWERS`           | `4`: cinco participantes totais.                                                                                                                      |
| Servidor                   | `MAX_PUBLISHERS`        | `2`: piloto de duas telas simultâneas; uma por pessoa.                                                                                                |
| Servidor, opcional         | `STATS_TOKEN`           | Segredo administrativo de 32 a 256 caracteres; não distribuir aos amigos. Sem ele, `/api/stats` fica desabilitada.                                    |
| Aplicativos                | Servidor de sinalização | Todos usam o mesmo endpoint nas Configurações.                                                                                                        |
| Distribuição               | Atualização por GitHub  | Conferir variáveis e workflow de [releases](releases.md), publicar instalador, metadados e arquivos auxiliares gerados. Assinatura continua opcional. |
| Conta da hospedagem/GitHub | Limites gratuitos       | Conferir cotas, suspensão e ausência de consumo pago habilitado na conta real. Nenhuma configuração de cobrança foi inspecionada aqui.                |

Não é preciso instalar outro servidor de mídia para esse piloto. O serviço de sinalização precisa estar acessível durante o uso, incluindo entradas e recuperação de conexões. Hospedagem gratuita pode suspender ou reiniciar o processo; reinício perde as salas em memória. Um computador próprio pode ser ligado apenas durante o uso se já houver uma forma gratuita e segura de acesso pelo grupo. Procedimentos em [implantacao.md](implantacao.md).

## Diagnóstico do servidor

No checkout atualizado, com Node.js e dependências instalados:

```powershell
npm run server:build
npm run server:check -- wss://SEU-SERVIDOR
```

Substitua o endereço. Sem argumento, usa `DISCORJA_SIGNALING_URL` ou o localhost padrão. O comando carrega `.env` se existir, mas não imprime o endpoint nem segredos. **Confira o destino antes de definir `STATS_TOKEN`**: a credencial será enviada a esse servidor por HTTPS.

O diagnóstico consulta `/health` e abre uma conexão WebSocket com Origin do aplicativo para confirmar `hello` no protocolo 3. Não cria sala nem inicia captura. Se houver `STATS_TOKEN` no ambiente administrativo, também verifica `/api/stats`, sem incluir os contadores no relatório. Nunca passe o token como argumento ou na URL.

O resultado tem `health`, `protocol`, `stats`, `notes` e `ok`. `ok: true` e saída 0 indicam aprovação apenas dessas verificações; falha retorna saída 1. `stats: not-requested` é normal sem token. Os outros valores são `available`, `disabled`, `unauthorized` e `failed`.

Cada operação tem limite de cinco segundos. Se uma hospedagem gratuita ainda está iniciando, espere a inicialização terminar e tente novamente. Não configure consultas contínuas para impedir a suspensão do plano gratuito. TLS inválido, redirecionamento e WS fora de localhost não são ignorados. O teste de saúde assume as rotas HTTP na raiz do mesmo host; adapte o proxy se usa um subcaminho de WebSocket.

Esse comando não comprova conectividade WebRTC, qualidade sustentada, funcionamento do TURN, proteção do sistema operacional ou atualização instalada.

## Piloto com o grupo

Comece com duas telas e três ou quatro computadores já disponíveis. Use somente vídeo no primeiro ensaio; microfone permanece no Discord. Registre versões e horário, sem publicar convites, IPs, tokens ou conteúdo das telas.

1. Atualize o servidor, execute o diagnóstico e abra uma sala com clientes 0.8.0.
2. Duas pessoas iniciam capturas diferentes. Antes de escolher **Assistir**, as demais não devem receber mídia. Tentar uma terceira captura deve mostrar o limite.
3. Escolha uma tela; alterne entre os cartões. Deve haver uma única recepção, sem áudio ou vídeo residual da anterior. Confira também **Parar de assistir**.
4. Faça os dois publicadores assistirem um ao outro. Parar uma publicação ou interrompê-la por moderação deve preservar a outra.
5. Minimize e depois deixe o aplicativo sem foco. A prévia própria deve pausar; quem assiste deve continuar recebendo. Volte ao aplicativo e confira a retomada da mesma captura.
6. Teste 720p/30, 1080p/30 e 1080p/60. Compare resolução e FPS efetivamente recebidos, perdas, latência, CPU/GPU e RAM. Use o diagnóstico exportado; o perfil solicitado não garante essa resolução/FPS no receptor.
7. Execute uma sessão de pelo menos 30 minutos no perfil pretendido. Compare consumo no início e no fim, incluindo trocas de tela. Crescimento sustentado, congelamentos ou envio acima da capacidade impedem ampliar o piloto.
8. Interrompa brevemente a rede, depois teste saída, remoção e troca de sala. A captura só pode ser reaproveitada enquanto ainda autorizada; não deve iniciar uma nova por comando remoto.
9. Teste áudio opcional com conteúdo conhecido. Confira sincronização e o bloqueio de reprodução enquanto captura som próprio. A captura geral pode incluir o Discord: não anuncie isolamento por janela sem um teste que o comprove.
10. Em duas versões instaladas, confira popup, adiar, download e reinício explícito. Durante compartilhamento, o reinício não pode interromper a sessão sem a ação permitida pelo app.

Para cada cenário, registre **passou/falhou/não executado**, duração, quantidade de publicadores/receptores, perfil pedido, valores recebidos e observações. Ainda faltam computadores/redes reais e dois instaladores publicados para concluir esses itens. O ensaio local não os substitui.

## Manutenção e incidente

Use usuário sem privilégios para a sinalização; mantenha só as portas necessárias e as restrições de [seguranca.md](seguranca.md). Não guarde credenciais de publicação do GitHub nessa máquina. Limite e rotacione logs, preserve somente o necessário para investigar erros e não registre conteúdo completo de SDP/ICE ou tokens.

Se houver suspeita de invasão, interrompa o serviço afetado e preserve logs pertinentes sem divulgar segredos. Revogue tokens administrativos e de publicação que possam ter sido expostos, revise acessos, atualize a máquina/dependências e recoloque o serviço somente após corrigir a causa. Reiniciar a sinalização invalida as salas anteriores; rotação de `STATS_TOKEN` exige reiniciar o serviço e atualizar somente o consumidor administrativo.

Se uma versão falhar, interrompa sua distribuição e confira o rollback do servidor em uma nova sessão, com clientes do mesmo protocolo. O atualizador do aplicativo não aceita downgrade automático; uma correção deve ter versão maior. Não reduza TLS, sandbox, validação de assinatura configurada ou permissões para contornar falhas.

## Próximo ponto de retomada

Executar o piloto acima com o grupo, registrar as medições e validar a atualização instalada. Só ampliar `MAX_PUBLISHERS` após comprovar capacidade. O código e o pacote 0.8.0 estão preparados localmente; a homologação externa da 0.8-A permanece pendente. Não representa a versão 1.0 nem uma release publicada.

## Ferramentas da 0.8.0

- `npm run test:accessibility`: teclado, foco, menus, diálogo e anunciador de estado em instâncias isoladas.
- `npm run test:soak`: piloto P2P local de 30 minutos, duas publicações e quatro instâncias, verificando frames e número de peers ativos. Para um ensaio curto, `node scripts/multistream-smoke.mjs --soak-minutes=3`. Captura somente a janela sintética do teste. O teste local não substitui computadores/redes diferentes.
- `npm run release:verify`: manifesto, tamanho, hash e arquivos da release antes do envio; não instala ou publica.
- **Conexão e diagnóstico → Salvar diagnóstico**: exporta o relatório de suporte versão 2. Ele omite identificadores e conteúdo; ainda assim, revise o arquivo antes de compartilhá-lo.

Antes de atualizar a sinalização, avise o grupo e espere todos saírem: reiniciar o processo encerra as salas em memória. O protocolo 3 é compatível entre clientes 0.7 e 0.8; as novas opções de interface e bitrate exigem o cliente 0.8. Não é necessário configurar uma nova variável de servidor para essas opções.

Caso a janela desejada não apareça na seleção, use **Atualizar janelas**. A lista é consultada novamente, sem iniciar captura; a seleção e o consentimento de áudio devem ser refeitos. O refresh e a fila de enumeração são limitados para evitar solicitações simultâneas sem controle.
