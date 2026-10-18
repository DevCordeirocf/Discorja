# Discorja

<p align="center">
  <img src="src/renderer/assets/logo.png" alt="Logo do Discorja" width="120" />
</p>

<p align="center">
  Compartilhe a tela com seu grupo em salas privadas, com vídeo enviado diretamente entre os participantes.
</p>

<p align="center">
  <strong>Windows 10/11 · x64</strong> &nbsp;|&nbsp; Electron · TypeScript · WebRTC
</p>

<p align="center">
  <a href="#recursos">Recursos</a> ·
  <a href="#começar">Começar</a> ·
  <a href="#usar-com-amigos">Usar com amigos</a> ·
  <a href="#documentação">Documentação</a>
</p>

## Sobre

O Discorja é um aplicativo desktop para compartilhar uma janela ou monitor com amigos. Crie uma sala, envie o código de convite e escolha uma transmissão para assistir.

A sinalização coordena salas e conexões, mas não recebe o vídeo. O áudio e o vídeo são enviados por WebRTC entre os participantes; redes que bloqueiam uma conexão direta podem exigir um servidor TURN.

## Recursos

- Salas por convite, com até **10 participantes** por sala por padrão.
- Compartilhamento de janela ou tela inteira, com prévia e controles para iniciar e parar.
- Todos os **10 participantes** podem transmitir ao mesmo tempo; cada pessoa assiste a uma transmissão por vez.
- Perfis de **720p/30 FPS**, **1080p/30 FPS**, **1080p/60 FPS** e **1080p/120 FPS**. A qualidade real depende da captura, do computador e da rede.
- Áudio opcional do computador e controle de volume da transmissão. A exclusão do áudio do Discord depende do Windows e da compatibilidade do aplicativo instalado.
- Ajustes de qualidade, adaptação à conexão, diagnóstico exportável e registros locais de erro.
- Notificação de atualização quando a distribuição do aplicativo está configurada para GitHub Releases.

As transmissões usam conexão ponto a ponto. Se várias pessoas assistirem à mesma tela, o computador que transmite envia uma cópia para cada espectador; o upload disponível e a capacidade de codificação podem reduzir a qualidade real.

O Discorja não captura microfone nem câmera e não grava transmissões.

## Telas

<p align="center">
  <a href="docs/screenshots/inicio.png"><img src="docs/screenshots/inicio.png" alt="Tela inicial do Discorja" width="32%" /></a>
  <a href="docs/screenshots/sala.png"><img src="docs/screenshots/sala.png" alt="Sala de demonstração do Discorja" width="32%" /></a>
  <a href="docs/screenshots/configuracoes.png"><img src="docs/screenshots/configuracoes.png" alt="Configurações do Discorja" width="32%" /></a>
</p>

<p align="center"><sub>Início · Sala em espera · Configurações</sub></p>

## Começar

### Requisitos para desenvolvimento

- Windows 10/11 x64.
- Node.js **22.12 ou superior** e npm.
- Visual Studio Build Tools com **Desenvolvimento para desktop com C++** somente para compilar o filtro nativo de áudio ou criar o instalador para Windows.

O instalador pronto não exige Node.js, npm ou Visual Studio Build Tools.

### Executar localmente

Na pasta do projeto, instale as dependências:

```powershell
npm ci
```

Copie o exemplo de configuração local:

```powershell
Copy-Item .env.example .env
```

Abra dois terminais na pasta do projeto. No primeiro, inicie o servidor de sinalização local:

```powershell
npm run server:dev
```

No segundo, inicie o aplicativo:

```powershell
npm run dev
```

O endereço local padrão é `ws://127.0.0.1:8787`. Para testar a exclusão do áudio do Discord durante o desenvolvimento, compile o componente nativo uma vez:

```powershell
npm run audio:build
```

### Usar com amigos

Para computadores diferentes, hospede o servidor de sinalização em um endereço público com TLS e WebSocket, acessível por **WSS**. Depois, cada participante deve informar o mesmo endereço em **Configurações → Servidor de sinalização**. O servidor local em `127.0.0.1` serve apenas para desenvolvimento no próprio computador.

O GitHub Releases distribui o instalador, mas não mantém o servidor de sinalização online. Veja [Implantação](docs/implantacao.md) para publicar e configurar o servidor e [Instaladores e atualizações](docs/releases.md) para configurar a distribuição do app.

## Comandos úteis

| Comando              | Ação                                                             |
| -------------------- | ---------------------------------------------------------------- |
| `npm run dev`        | Inicia o aplicativo em desenvolvimento.                          |
| `npm run server:dev` | Inicia a sinalização local.                                      |
| `npm run build`      | Gera o build do aplicativo e do servidor.                        |
| `npm run typecheck`  | Verifica os tipos TypeScript.                                    |
| `npm test`           | Executa os testes automatizados.                                 |
| `npm run dist:win`   | Gera o instalador Windows; requer o ambiente C++ descrito acima. |

## Documentação

- [Salas e permissões](docs/salas.md) — convites, participantes, transmissões simultâneas e moderação.
- [Qualidade e estabilidade](docs/qualidade.md) — perfis, bitrate, adaptação e limites de desempenho.
- [Áudio](docs/audio.md) — áudio do sistema, exclusão do Discord e requisitos.
- [Implantação](docs/implantacao.md) — servidor público, WSS, variáveis de ambiente e STUN/TURN.
- [Instaladores e atualizações](docs/releases.md) — GitHub Releases, atualização automática e assinatura opcional.
- [Segurança](docs/seguranca.md) — proteção do aplicativo, servidor e dados.
- [Arquitetura e privacidade](docs/arquitetura.md) — componentes e fluxo de mídia.
- [Logs de erros](docs/logs.md) — exportação e conteúdo dos registros locais.
- [Plano de atualizações](docs/plano-de-atualizacoes.md) — etapas planejadas para o produto.

## Licença

O projeto ainda não possui uma licença de uso definida.
