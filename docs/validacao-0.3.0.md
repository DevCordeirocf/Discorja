# Validação da versão 0.3.0

**Data:** 15 de outubro de 2026. **Estado:** implementação local preparada; publicação e verificações no ambiente real ainda pendentes. Aplicativo, manifesto do pacote e lockfile usam 0.3.0. Esta validação não certifica ausência de vulnerabilidades.

## Entregas implementadas

| Subetapa | Resultado local                                                                                                                                   | Limite de validação                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 0.3-A    | Cadeia vulnerável removida por override restrito; instalação limpa reproduzida.                                                                   | Auditoria mostra avisos conhecidos na data, não todas as falhas possíveis.                               |
| 0.3-B    | Política de arquivos do protocolo local, validação de remetente IPC, navegação bloqueada e sandbox preservada.                                    | Testes definidos de isolamento; não é um teste de invasão completo do Windows.                           |
| 0.3-C1   | Mensagens recebidas validadas com limites, mensagens inválidas repetidas encerram socket e negociações/filas são limitadas.                       | Não promete resistência a saturação do link ou ataque distribuído.                                       |
| 0.3-C2   | Dockerfile mantém usuário não root; compose adiciona arquivos somente leitura, capacidades removidas e limites de recursos/logs.                  | Docker e hospedagem real não disponíveis para inspeção nesta sessão; implantação precisa ser conferida.  |
| 0.3-D    | `/api/stats` autenticada, agregada, sem cache e com limite de consultas; desabilitada sem segredo.                                                | Contagem por processo, sem identidade pessoal nem histórico.                                             |
| 0.3-E1   | Actions fixadas por SHA oficial, checkout sem credenciais persistidas, audit no CI/release e atualização de dependências proposta por Dependabot. | 2FA, permissões, proteção de branch e faturamento das contas não inspecionados.                          |
| 0.3-E2   | Popup, adiar, download explícito, progresso, recuperação de erro e confirmação antes de reiniciar.                                                | Falta instalação/atualização real entre duas releases publicadas, com versão final conferida no Windows. |
| 0.3-F    | Folga de 15% no orçamento, preferência de codec com alternativas, mais métricas e diagnóstico exportável por allowlist.                           | Ensaios locais curtos; faltam 30 minutos em computadores/redes separados com um e quatro espectadores.   |
| 0.3-G1   | Retomada de sessão por token temporário rotacionado, prazo limitado e recuperação de mídia sem nova captura automática.                           | Reinício do backend perde as salas; clientes antigos não ganham retomada automaticamente.                |
| 0.3-G2   | TURN próprio permanece opcional e desabilitado neste ambiente.                                                                                    | Adiado por ausência de infraestrutura própria validada sem contratação; P2P permanece disponível.        |

Microfone, áudio do computador, novas interfaces de salas e várias telas simultâneas continuam nas etapas posteriores. Prints e gravações de espectadores não são restringidos.

## Verificações automatizadas

- `npm ci` reproduziu o override e o runtime Electron durante a 0.3-A.
- Auditoria completa e de produção, verificação de tipos, formatação, testes e build são executados para a entrega. O número final de testes e o ensaio empacotado estão no registro do [plano](plano-de-atualizacoes.md).
- Testes de backend cobrem contagem, autenticação, limite de consultas, expiração, retomada sem duplicação, rotação/reutilização de token, expulsão e falsificação de papel, além dos cenários anteriores.
- Testes de isolamento cobrem IPC fora do frame/janela confiáveis, navegação/arquivos e mensagens adulteradas. O diagnóstico exportado descarta identificadores, credenciais e campos desconhecidos.
- Uma busca limitada nos arquivos do projeto não encontrou padrões de chave privada ou tokens conhecidos do GitHub. Isso não é uma varredura completa de todos os formatos de segredo nem do histórico Git.

## App real e vídeo

O primeiro ensaio de desenvolvimento passou por 18 cenários e o primeiro ensaio empacotado por 21, incluindo perda de sinalização do anfitrião, popup de atualização, captura real da janela de teste, troca de perfis, tela cheia, redução do orçamento e teste de remoção/encerramento. Após acrescentar retomada do espectador e exportação real de diagnóstico, o ensaio identificou um timer transitório que apagava erro de uma sessão posterior. O timer foi corrigido; o código final passou nos **20 cenários do modo de desenvolvimento**, incluindo ambos os tipos de retomada e persistência da mensagem de sala encerrada.

O ensaio empacotado comparou preferências VP8/H264 e executou emulação de perda de rede mais um minuto adicional de transmissão local com dois espectadores. O valor de perda solicitado no emulador não é tratado como perda efetivamente medida. O relatório dessa comparação foi preservado em `test-results/smoke-packaged-codecs.json`; os ensaios comuns usam `test-results/smoke-packaged.json`, ambos fora do Git.

**Amostras daquele ensaio:** na fase H264, o espectador recebeu 1920×1032 a aproximadamente 59,9 FPS e 2,92 Mbps. Na fase VP8, recebeu resolução menor; o teste tem carga e condições variáveis, portanto não é comparação controlada nem garantia de superioridade universal do H264. 1920×1032 é o tamanho observado da fonte de teste, não 1920×1080. O minuto adicional registrou essa mesma resolução perto de 60 FPS. Outras fases chegaram a resoluções bem menores, mesmo mantendo cadência alta.

Esses resultados justificam disponibilizar a preferência de formato e mostrar as medidas reais. Não comprovam 1080p/60 sustentado entre máquinas diferentes, aceleração de hardware ou latência de ponta a ponta.

Na amostra H264, o navegador informou `MediaFoundationVideoEncodeAccelerator (NVIDIA H.264 Encoder MFT)` e `powerEfficientEncoder: true`. Na amostra VP8, informou `libvpx` e `false`. Isso identifica o caminho relatado nesta máquina, sem garantir que outro computador utilize o mesmo codificador. A comparação ocorreu após o teste de rede, com amostras curtas e tempos distintos de recuperação; não permite atribuir toda a diferença observada somente ao codec.

## Atualizador real com provedor local de teste

`node scripts/check-updater.mjs` usa o app empacotado e o `electron-updater` real, com cache e perfil isolados. Verifica:

1. Versão atual: sem popup.
2. Falha de conexão ao provedor local: app continua utilizável e informa erro da consulta.
3. Manifesto com checksum incorreto: pacote recusado; app continua utilizável.
4. Pacote com checksum correto: download validado e botão de reinício disponível, aguardando ação.

O manifesto local anuncia uma versão fictícia seguinte usando o instalador corrente como arquivo de teste; isso exercita download, integridade e interface, **não** uma mudança real de versão instalada. O provedor genérico local é configurado apenas pelo código de teste no processo principal. Não existe configuração equivalente exposta à sinalização ou ao usuário remoto.

O instalador não é executado por esse teste. Nenhuma release é publicada, e a instalação existente do usuário permanece fora do ensaio. O pacote também consultou o GitHub configurado e recusou downgrade para a release mais antiga disponível no momento do teste.

## Limite de execução do pacote final no Windows

O instalador final `release/Discorja-Setup-0.3.0.exe` foi gerado sem publicação; tamanho e SHA-512 foram conferidos contra `latest.yml`, e o blockmap está presente. A assinatura Authenticode retornou `NotSigned`, conforme o modo opcional escolhido.

Ao tentar repetir o teste após a última correção, o Windows bloqueou `release/win-unpacked/Discorja.exe` com a mensagem de política **Device Guard**. Não foi alterada essa política, nem foi investigada a regra exata de confiança aplicada pela organização. O resultado limita a afirmação sobre o último executável: ele foi empacotado e sua integridade conferida, mas sua execução final não foi validada neste ambiente.

A correção foi então testada com o runtime oficial do Electron em desenvolvimento, que executou os 20 cenários. Os 21 cenários empacotados e os quatro do updater real foram concluídos em builds anteriores da mesma implementação, antes da última correção do timer. O teste do instalador final/atualização instalada continua pendente em ambiente autorizado a executar esse pacote; não presumir que publicar no GitHub removerá o bloqueio. Assinatura comercial não se tornou requisito do projeto.

## Configurar antes da utilização com amigos

1. Implantar o backend 0.3.0 no serviço já utilizado, com WSS/TLS e `ALLOWED_ORIGINS=app://discorja`. A atualização do desktop não atualiza o servidor.
2. Manter os limites de piloto: `MAX_ROOMS=5`, `MAX_CLIENTS=20`, `MAX_VIEWERS=4` e `RESUME_GRACE_MS=20000`. Conferir o comportamento real do proxy e da retomada após queda breve.
3. Para consultar contagem, cadastrar `STATS_TOKEN` aleatório somente no servidor e consumir `/api/stats` por HTTPS com Bearer; sem ele, a rota fica desabilitada.
4. Conferir usuário do processo, portas, permissões de arquivos, ausência de credenciais de publicação e regras de rede no ambiente real. Se usar Docker próprio, validar a configuração antes de publicar.
5. Conferir que Render/GitHub não permitem excedentes pagos na conta. Ao atingir cotas gratuitas, aceitar suspensão; TURN/SFU pagos não são parte da entrega.
6. Publicar os artefatos da mesma compilação pelo workflow existente e testar a atualização de uma instalação anterior. Não misturar instalador, blockmap e manifesto de builds diferentes da mesma versão.
7. Executar o ensaio prolongado descrito em [qualidade](qualidade.md) e, depois, testar entre computadores/redes diferentes com o grupo. Registrar limitações sem tratar perfil solicitado como capacidade garantida.

As ações em contas e hospedagem não foram executadas nesta sessão. O código está preparado para revisão; a validação operacional só poderá ser encerrada depois dessas verificações.
