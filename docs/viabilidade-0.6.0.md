# 0.6-A — Viabilidade de SFU própria

**Data:** 16 de outubro de 2026. **Estado:** avaliação encerrada com decisão de adiar a SFU. O responsável confirmou que não há onde hospedar e que o grupo pequeno, com uso ocasional, não justifica essa estrutura. A integração 0.6-B não será implementada no escopo atual. O aplicativo permanece em P2P na versão 0.5.0.

## Decisão registrada

Manter a sinalização existente e a mídia P2P, sem adicionar hospedagem de mídia, LiveKit, novas dependências ou custos. A próxima ampliação prevista é a 0.7-A, com duas telas simultâneas no piloto P2P e limites de participantes/banda a validar. Não há infraestrutura de SFU pendente que impeça essa evolução.

Os critérios abaixo ficam apenas como referência para uma eventual reconsideração, caso o uso cresça e apareça infraestrutura já disponível. Não há instalação ou implantação de SFU programada.

## Quando a SFU faz diferença

Na implementação atual, cada transmissor envia sua captura para cada espectador. A sinalização organiza salas e permissões, sem distribuir o vídeo. Uma SFU, como o LiveKit auto-hospedado, recebe a publicação e encaminha cópias aos receptores.

A máquina da SFU precisa ficar ligada e conectada durante as sessões que passam por ela. Pode ser iniciada antes dos encontros e encerrada depois. Desligamento, suspensão e perda de rede interrompem a distribuição. Não está sendo proposto um serviço obrigatório durante todo o dia.

**Hospedar no mesmo PC ou na mesma conexão do transmissor não elimina o upload agregado dessa conexão.** A mídia passa a sair da SFU, mas ainda atravessa a mesma internet residencial. Há uma diferença entre reduzir o número de envios do aplicativo transmissor e reduzir o tráfego da conexão que hospeda o conjunto.

Exemplo aritmético, sem sobrecarga de transporte, considerando uma publicação de 12 Mbps e quatro receptores externos:

| Localização da mídia | Upload do transmissor           | Upload da SFU           | Efeito na conexão do transmissor                 |
| -------------------- | ------------------------------- | ----------------------- | ------------------------------------------------ |
| P2P atual            | Aproximadamente 48 Mbps         | Não há                  | Quatro cópias saem por sua internet.             |
| SFU em outra conexão | Aproximadamente 12 Mbps         | Aproximadamente 48 Mbps | A outra conexão assume a distribuição.           |
| SFU no mesmo PC/rede | Encaminhamento local para a SFU | Aproximadamente 48 Mbps | As quatro cópias ainda saem pela mesma internet. |

São contas de orçamento, não medições ou garantias de qualidade. Áudio, cabeçalhos, retransmissões, outras publicações e camadas de vídeo acrescentam consumo. Se outro participante transmitir para sua SFU, a sua conexão também assume a distribuição dessa publicação.

## Evidências locais disponíveis

O computador de desenvolvimento inspecionado tem Windows x64, doze processadores lógicos e aproximadamente 15,7 GiB de RAM total. A memória disponível observada foi de aproximadamente 4,3 GiB, sujeita à carga do momento. Isso não certifica capacidade para hospedar e jogar/transmitir ao mesmo tempo.

Não foram encontrados comandos Docker ou LiveKit Server no PATH. O WSL informou que não está instalado. Esses fatos não tornam Docker/WSL requisitos: o LiveKit também disponibiliza execução local no Windows. Nenhum deles foi instalado nesta avaliação.

Ainda não foram medidos upload/download sustentados, CPU sob SFU, perdas, alcance externo, NAT/CGNAT, portas, TLS ou capacidade com espectadores. Não foram abertos firewall/roteador nem criado serviço persistente. A máquina de desenvolvimento ainda não foi confirmada como o host pretendido.

## Render e ausência de contratação

O Render pode continuar como sinalização. A exposição pública documentada de um web service é uma porta HTTP; o LiveKit também precisa de conectividade de mídia ICE, como UDP ou TCP direto. Por isso o Render Free não é um destino aprovado nesta avaliação para hospedar a SFU convencional. Expor somente o WebSocket não comprova transporte de vídeo.

A 0.6 não exige LiveKit Cloud, VPS, IP público contratado, domínio pago ou licença comercial. Se a máquina/rede disponíveis não permitirem o piloto, a etapa deve ser adiada e o P2P permanece funcionando. Não foi confirmada a configuração de cobrança da conta Render; suas cotas e suspensão continuam independentes desta avaliação.

## Critérios para avançar à 0.6-B

1. Definir uma máquina já disponível e quando ficará ligada. Informar se compartilha a conexão com quem transmite.
2. Confirmar acesso de administração e execução do LiveKit nesse ambiente sem contratação. Instalações e serviços devem ser tratados como mudanças explícitas do host escolhido.
3. Medir capacidade ociosa e upload sustentado e comparar com o orçamento do grupo. Taxa nominal do adaptador não mede upload de internet.
4. Verificar acesso externo da mídia e um endpoint seguro. CGNAT, bloqueios e ausência de endereço/certificado adequados não serão contornados desativando TLS ou contratando recursos.
5. Confirmar que não há dependência de consumo pago e executar o piloto antes de ampliar participantes.

Somente após esses critérios, integrar tokens por sala/participante/papel, revogação, publicação explícita de tela/som, recepção seletiva, reconexão e limpeza. Credenciais administrativas ficam no servidor. A SFU passa a participar do transporte e da relação de confiança da mídia; criptografia de transporte não implica criptografia ponta a ponta entre usuários.

O plano não prevê fallback automático de uma sessão SFU para P2P. Em caso de piloto indisponível, o retorno operacional seria entrar novamente em uma sala do modo anterior.

## Ponto de retomada

A avaliação 0.6-A foi encerrada e a integração 0.6-B ficou adiada, por decisão do responsável. Não há definição de host a aguardar no escopo atual. Não alterar a versão do pacote por essa decisão. A próxima implementação, quando solicitada, é a 0.7-A em P2P limitado, sem depender de contratar SFU.

## Fontes consultadas

- [LiveKit: execução local, inclusive Windows](https://docs.livekit.io/transport/self-hosting/local/).
- [LiveKit: implantação, TLS e recursos](https://docs.livekit.io/transport/self-hosting/deployment/).
- [LiveKit: portas e firewall](https://docs.livekit.io/transport/self-hosting/ports-firewall/).
- [Render: exposição de portas de web services](https://render.com/docs/web-services#binding-to-multiple-ports).
- [Render: limites dos serviços gratuitos](https://render.com/docs/free).
