# Hospedar a sinalização

O servidor mantém salas em memória e encaminha mensagens de negociação WebRTC. Ele não recebe a captura de tela. Um TURN, quando configurado nos aplicativos, exerce uma função separada e pode retransmitir o vídeo.

## Servidor local

```powershell
npm ci
npm run server:build
$env:HOST = '127.0.0.1'
$env:PORT = '8787'
npm run server:start
```

`GET /health` responde com `{"status":"ok"}` se o processo estiver disponível. Os caminhos `/` e `/ws` aceitam WebSocket. Um resultado saudável não comprova que dois aplicativos conseguem estabelecer uma conexão WebRTC.

## Docker

O Dockerfile gera uma imagem Linux somente para a sinalização. O aplicativo Electron continua instalado nos computadores Windows.

```powershell
docker build -t discorja-signaling .
docker run --rm --name discorja-signaling -p 127.0.0.1:8787:8787 -e ALLOWED_ORIGINS=app://discorja discorja-signaling
```

A publicação em `127.0.0.1` permite que um proxy TLS no mesmo host encaminhe as conexões. Caso o proxy também esteja em um container, coloque ambos em uma rede Docker e encaminhe para `discorja-signaling:8787`; ajuste a exposição da porta de acordo com essa topologia.

## Endpoint público

1. Escolha um host que mantenha conexões WebSocket abertas e permita configurar TLS.
2. Aponte um domínio para esse host e configure um certificado válido.
3. Encaminhe as requisições HTTP e o upgrade WebSocket para a porta 8787 do processo. O timeout do proxy deve permitir conexões longas.
4. Mantenha a porta interna acessível apenas pelo proxy.
5. Configure `ALLOWED_ORIGINS` para o aplicativo de produção e quaisquer origens de desenvolvimento que você autorize.
6. Informe o endpoint `wss://seu-dominio` em todos os aplicativos.

Exemplo de proxy com Caddy, executado no mesmo host do container:

```caddyfile
sinal.exemplo.com {
    reverse_proxy 127.0.0.1:8787
}
```

Substitua o domínio e faça a configuração de DNS/TLS no ambiente escolhido. Consulte a [documentação do proxy reverso do Caddy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy). O projeto não provisiona domínio, hospedagem ou TURN e não pressupõe disponibilidade de plano gratuito.

## Variáveis do servidor

| Variável          | Função                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HOST`            | Interface de escuta; no container, `0.0.0.0`. Use `127.0.0.1` para um processo restrito à máquina local.                                                            |
| `PORT`            | Porta HTTP/WebSocket; padrão `8787`.                                                                                                                                |
| `ALLOWED_ORIGINS` | Lista de origens permitidas separadas por vírgula. Padrão: `app://discorja,http://127.0.0.1:5173,http://localhost:5173`. Em produção, restrinja a `app://discorja`. |
| `MAX_VIEWERS`     | Número máximo de espectadores por sala; padrão `4`.                                                                                                                 |
| `ROOM_TTL_MS`     | Duração máxima de uma sala em milissegundos; padrão `14400000` (quatro horas).                                                                                      |
| `MAX_ROOMS`       | Limite de salas simultâneas no processo; padrão `1000`.                                                                                                             |
| `MAX_CLIENTS`     | Limite de conexões simultâneas no processo; padrão `5000`.                                                                                                          |

Configure limites de acordo com a capacidade do host. Aumentar `MAX_VIEWERS` não resolve o limite de upload do anfitrião. A checagem de `Origin` reduz o uso por páginas de terceiros, mas não substitui autenticação nem impede clientes WebSocket próprios de enviar a mesma origem.

O limite de tentativas usa o IP da conexão TCP e ignora `X-Forwarded-For`. Atrás de um proxy, os participantes podem compartilhar o mesmo IP para esse controle. Os padrões por IP são 60 novas conexões por minuto, 40 tentativas de entrada em salas por minuto e 1000 mensagens a cada dez segundos; tentativas inválidas também contam. Esses limites são compartilhados pelos clientes que chegam pelo mesmo IP do proxy e atualmente não têm variáveis de ambiente próprias.

Valide o ritmo de conexões e reconexões esperado pelo grupo no proxy escolhido e configure também sua proteção de tráfego. Não passe a confiar em `X-Forwarded-For` enviado pelo cliente para contornar o limite; uma futura identificação do IP original exigirá uma configuração explícita de proxies confiáveis.

Não execute várias réplicas como se compartilhassem o mesmo estado: as salas existem apenas em uma instância. Um reinício encerra as salas ativas. Para este MVP, use uma única instância e monitore memória, conexões, reinícios e disponibilidade de `/health`. Evite registrar códigos de sala, descrições SDP e candidatos ICE, que podem conter dados de conexão dos participantes.

## STUN e TURN nos clientes

Defina `DISCORJA_ICE_SERVERS` no ambiente que inicia o Discorja, tanto no anfitrião quanto nos espectadores. Exemplo de estrutura — os endereços e as credenciais abaixo precisam ser substituídos:

```powershell
$env:DISCORJA_ICE_SERVERS = '[{"urls":"stun:turn.exemplo.com:3478"},{"urls":["turn:turn.exemplo.com:3478?transport=udp","turns:turn.exemplo.com:5349?transport=tcp"],"username":"usuario-temporario","credential":"credencial-temporaria"}]'
```

O valor é uma configuração local; não há entrega automática de credenciais temporárias neste MVP. Distribua-as por um canal privado, limite sua duração e consumo e renove-as quando necessário. A existência de TURN não garante conexão em toda rede. Consulte a [documentação de servidores TURN do WebRTC](https://webrtc.org/getting-started/turn-server).

## Validação antes de convidar o grupo

- Verifique HTTPS e `/health` no domínio público.
- Crie uma sala em um computador e entre em outro, primeiro na mesma rede e depois em redes diferentes.
- Confirme o recebimento do vídeo, parar captura, remover espectador, fechar sala, expiração e reconexão após queda.
- Teste uma conexão que use TURN e acompanhe o consumo no serviço de retransmissão.
- Reinicie a sinalização e confirme que os aplicativos apresentam a interrupção e permitem criar outra sala.

Esses cenários de rede precisam ser executados no ambiente de implantação; testes locais e automatizados não os substituem.
