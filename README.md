# Discorja

Aplicativo de compartilhamento de tela para **Windows 10/11 x64**, feito para pequenos grupos. Crie uma sala, escolha uma janela ou monitor e compartilhe o código para seus amigos assistirem.

## Recursos

- Salas por convite com código de oito caracteres.
- Captura de janela ou monitor com prévia e controles para iniciar e parar.
- Até quatro espectadores por sala na configuração padrão.
- Perfis de **720p/30 FPS**, **1080p/30 FPS** e **1080p/60 FPS**.
- Prioridade para detalhes ou movimento, adaptação por espectador e limite de envio.
- Indicadores de qualidade da transmissão e controle de participantes.
- Instalador Windows e suporte a atualizações por GitHub Releases, mediante configuração da distribuição.

O MVP transmite somente o vídeo da tela. Áudio, câmera e gravação não estão disponíveis nesta versão. A qualidade recebida depende da fonte, do computador e da conexão.
<img width="1917" height="1011" alt="Captura de tela 2026-10-14 230554" src="https://github.com/user-attachments/assets/13a6b040-d873-4337-b494-ae7241931d07" />
<img width="1918" height="1007" alt="Captura de tela 2026-10-14 230619" src="https://github.com/user-attachments/assets/5ec9745b-16bb-48b1-9a0a-e6d50589a1b0" />
<img width="1348" height="607" alt="Captura de tela 2026-10-14 230629" src="https://github.com/user-attachments/assets/16cb8698-e2c5-48ad-8c44-d552e3db91e7" />


## Índice

## Tecnologias

**Electron** e **TypeScript** no aplicativo, **WebRTC** para o vídeo e **Node.js/WebSocket** para a sinalização das salas. O vídeo sai do computador do anfitrião para cada espectador, diretamente ou por TURN quando configurado.

## Requisitos

Para executar o projeto em desenvolvimento:

- Windows 10/11 x64.
- Node.js **22.12 ou superior** e npm.

Quem utiliza o aplicativo instalado não precisa instalar Node.js ou npm.

## Início rápido

Na pasta do projeto, instale as dependências:

```powershell
npm ci
```

Inicie a sinalização em um terminal:

```powershell
npm run server:dev
```

Em outro terminal, abra o aplicativo:

```powershell
npm run dev
```

O endereço local padrão é `ws://127.0.0.1:8787`. Para testar com outro computador, todos precisam usar o mesmo servidor acessível por WSS; consulte o [guia de implantação](docs/implantacao.md).

## Como usar

1. Abra o Discorja e configure o servidor de sinalização.
2. Informe seu nome e crie uma sala.
3. Escolha a qualidade e a janela ou monitor que deseja transmitir.
4. Inicie a transmissão e compartilhe o código com os amigos.
5. Use os controles para parar o vídeo, remover espectadores ou encerrar a sala.

## Documentação

- [Guia de desenvolvimento](docs/desenvolvimento.md) — ambiente, configurações, testes, manutenção e diagnóstico.
- [Arquitetura e privacidade](docs/arquitetura.md) — componentes, conexões e tratamento dos dados.
- [Implantação](docs/implantacao.md) — sinalização pública, TLS e STUN/TURN.
- [Instaladores e releases](docs/releases.md) — assinatura, publicação e atualizações.
- [Qualidade e estabilidade](docs/qualidade.md) — perfis, adaptação e desempenho.
- [Validação da versão 0.2.0](docs/validacao-0.2.0.md) — resultados dos testes e limites observados.

## Licença

O projeto ainda não possui uma licença de uso definida.
