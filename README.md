# Discorja

Aplicativo de compartilhamento de tela para **Windows 10/11 x64**, feito para pequenos grupos. Crie uma sala, escolha uma janela ou monitor e compartilhe o código para seus amigos assistirem.

## Recursos

- Salas por convite com código de oito caracteres.
- Salas nomeadas, convites recentes e troca com encerramento da mídia anterior.
- Dono e moderadores separados de quem transmite; uma tela ativa por sala.
- Captura de janela ou monitor com prévia e controles para iniciar e parar.
- Som do computador opcional no Windows, com controle de envio e volume recebido.
- Até quatro espectadores por sala na configuração padrão.
- Perfis de **720p/30 FPS**, **1080p/30 FPS** e **1080p/60 FPS**.
- Prioridade para detalhes ou movimento, adaptação por espectador e limite de envio.
- Indicadores de qualidade da transmissão e controle de participantes.
- Diagnóstico exportável, preferência de formato de vídeo e recuperação de quedas breves.
- Aviso de atualização ao abrir, com opção de atualizar ou adiar.
- Instalador Windows e atualizações por GitHub Releases, com assinatura de código opcional.

Microfone, câmera e gravação não fazem parte do aplicativo. O som compartilhado pode incluir outros programas, inclusive o Discord; não há isolamento de áudio por janela. A qualidade recebida depende da fonte, do computador e da conexão.
<img width="1917" height="1011" alt="Captura de tela 2026-10-14 230554" src="https://github.com/user-attachments/assets/13a6b040-d873-4337-b494-ae7241931d07" />
<img width="1918" height="1007" alt="Captura de tela 2026-10-14 230619" src="https://github.com/user-attachments/assets/5ec9745b-16bb-48b1-9a0a-e6d50589a1b0" />
<img width="1348" height="607" alt="Captura de tela 2026-10-14 230629" src="https://github.com/user-attachments/assets/16cb8698-e2c5-48ad-8c44-d552e3db91e7" />

## Índice

## Tecnologias

**Electron** e **TypeScript** no aplicativo, **WebRTC** para vídeo e áudio e **Node.js/WebSocket** para a sinalização das salas. A mídia sai do computador do anfitrião para cada espectador, diretamente ou por TURN quando configurado.

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
4. Se quiser transmitir som, marque a opção e confira o aviso antes de iniciar. Durante chamadas no Discord, prefira somente vídeo até validar uma saída de som isolada.
5. Inicie a transmissão e compartilhe o código com os amigos. Quem assiste pode clicar em **Ouvir transmissão** e ajustar o volume.
6. Use os controles para silenciar ou encerrar a captura de som, parar o vídeo, remover espectadores ou encerrar a sala.
7. Abra **Salas** para criar outra sala ou entrar por um convite salvo. O dono ou moderador pode usar **Permitir tela** para autorizar outro transmissor, que inicia sua própria captura.

Na versão 0.5.0, atualize primeiro o servidor e use clientes compatíveis na mesma sala. A troca encerra a sessão anterior; se o dono trocar ou sair, sua sala é encerrada para todos. Veja o [guia de salas](docs/salas.md).

## Documentação

- [Plano de evolução](docs/plano-de-atualizacoes.md) — próximas versões de desempenho, áudio, salas e compartilhamento simultâneo.
- [Segurança](docs/seguranca.md) — revisão, melhorias propostas e operação sem serviços pagos.
- [Áudio e Discord](docs/audio.md) — uso, controles e configurações suportadas.
- [Salas e permissões](docs/salas.md) — navegação, troca, moderação e migração de versões.
- [Validação da versão 0.5.0](docs/validacao-0.5.0.md) — testes e pendências desta etapa.
- [Validação da versão 0.4.0](docs/validacao-0.4.0.md) — testes de áudio e verificações pendentes.
- [Validação da versão 0.3.0](docs/validacao-0.3.0.md) — entregas, testes e verificações de implantação pendentes.
- [Guia de desenvolvimento](docs/desenvolvimento.md) — ambiente, configurações, testes, manutenção e diagnóstico.
- [Arquitetura e privacidade](docs/arquitetura.md) — componentes, conexões e tratamento dos dados.
- [Implantação](docs/implantacao.md) — sinalização pública, TLS e STUN/TURN.
- [Instaladores e releases](docs/releases.md) — assinatura, publicação e atualizações.
- [Qualidade e estabilidade](docs/qualidade.md) — perfis, adaptação e desempenho.
- [Validação da versão 0.2.0](docs/validacao-0.2.0.md) — resultados dos testes e limites observados.

## Licença

O projeto ainda não possui uma licença de uso definida.
