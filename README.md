# Discorja

Aplicativo de compartilhamento de tela para **Windows 10/11 x64**, feito para pequenos grupos. Crie uma sala, escolha uma janela ou monitor e compartilhe o código para seus amigos assistirem.

## Recursos

- Salas por convite com código de oito caracteres.
- Cada cliente participa de uma sala por vez; usuários diferentes podem manter salas distintas ativas ao mesmo tempo.
- Duas pessoas podem transmitir ao mesmo tempo no piloto P2P; cada participante assiste a uma tela por vez.
- Cartões para escolher quem assistir e controles independentes para compartilhar sua própria tela.
- Prévia local pausada em segundo plano, preservando a captura enviada aos amigos.
- Captura de janela ou monitor com prévia e controles para iniciar e parar.
- Som do computador opcional no Windows; em sistemas compatíveis, pode excluir o áudio do aplicativo Discord sem silenciá-lo localmente.
- Até dez participantes por sala na configuração padrão, com dono e moderadores.
- Perfis de **720p/30 FPS**, **1080p/30 FPS**, **1080p/60 FPS** e **1080p/120 FPS**.
- Prioridade para detalhes ou movimento, adaptação por espectador e limite de envio.
- Teto de vídeo ajustável até 100 Mbps por espectador, com indicação em MB/s e orçamento total compartilhado de até 500 Mbps.
- Navegação por teclado com foco preservado durante atualizações da sala.
- Indicadores de qualidade da transmissão e controle de participantes.
- Diagnóstico exportável, preferência de formato de vídeo e recuperação de quedas breves.
- Aviso de atualização ao abrir, com opção de atualizar ou adiar.
- Instalador Windows e atualizações por GitHub Releases, com assinatura de código opcional.

Microfone, câmera e gravação não fazem parte do aplicativo. O som geral pode incluir outros programas; a opção de exclusão filtra o processo do Discord instalado em versões compatíveis do Windows. A qualidade recebida depende da fonte, do computador e da conexão.
<img width="1917" height="1011" alt="Captura de tela 2026-10-14 230554" src="https://github.com/user-attachments/assets/13a6b040-d873-4337-b494-ae7241931d07" />
<img width="1918" height="1007" alt="Captura de tela 2026-10-14 230619" src="https://github.com/user-attachments/assets/5ec9745b-16bb-48b1-9a0a-e6d50589a1b0" />
<img width="1348" height="607" alt="Captura de tela 2026-10-14 230629" src="https://github.com/user-attachments/assets/16cb8698-e2c5-48ad-8c44-d552e3db91e7" />

## Tecnologias

**Electron** e **TypeScript** no aplicativo, **WebRTC** para vídeo e áudio e **Node.js/WebSocket** para a sinalização das salas. Cada transmissor envia mídia somente para quem escolheu assistir à sua tela, diretamente ou por TURN quando configurado.

## Requisitos

Para executar o projeto em desenvolvimento:

- Windows 10/11 x64.
- Node.js **22.12 ou superior** e npm.
- Visual Studio Build Tools com **Desenvolvimento para desktop com C++** para compilar ou empacotar o filtro de áudio nativo.

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

Para testar em desenvolvimento a opção de excluir o Discord do áudio, compile o helper nativo uma vez:

```powershell
npm run audio:build
```

Os comandos `npm run dist:win` e `npm run pack:win` compilam e incluem o helper automaticamente. Quem instala o aplicativo não precisa do Visual Studio Build Tools.

Em outro terminal, abra o aplicativo:

```powershell
npm run dev
```

O endereço local padrão é `ws://127.0.0.1:8787`. Para testar com outro computador, todos precisam usar o mesmo servidor acessível por WSS; consulte o [guia de implantação](docs/implantacao.md).

## Como usar

1. Abra o Discorja e configure o servidor de sinalização.
2. Informe seu nome e crie uma sala.
3. Escolha a qualidade e a janela ou monitor que deseja transmitir.
4. Se quiser transmitir som durante uma call, marque **Excluir o áudio do Discord da transmissão**. Se o Windows não suportar o filtro, o vídeo seguirá sem áudio.
5. Inicie a transmissão e compartilhe o código com os amigos. Eles entram na sala e escolhem **Assistir** no cartão desejado.
6. Outra pessoa pode usar **Compartilhar minha tela** enquanto houver espaço. Você pode transmitir e assistir a outra pessoa simultaneamente; trocar de cartão encerra a recepção anterior.
7. Quem recebe pode usar **Ouvir transmissão** e ajustar o volume. O som recebido fica bloqueado enquanto captura o som do próprio computador, para evitar retorno.
8. Use **Parar de compartilhar** e **Parar de assistir** de forma independente. Abra **Salas** para alternar de sala; o menu de cada participante oferece os controles de moderação autorizados.

Na versão 0.8.0, atualize primeiro o servidor e use clientes com protocolo 3 na mesma sala. `MAX_PUBLISHERS=2` é o limite padrão de telas simultâneas. A troca de sala encerra a sessão anterior; se o dono trocar ou sair, sua sala é encerrada para todos. Veja o [guia de salas](docs/salas.md).

## Documentação

- [Plano de evolução](docs/plano-de-atualizacoes.md) — próximas versões de desempenho, áudio, salas e compartilhamento simultâneo.
- [Segurança](docs/seguranca.md) — revisão, melhorias propostas e operação sem serviços pagos.
- [Áudio e Discord](docs/audio.md) — uso, controles e configurações suportadas.
- [Salas e permissões](docs/salas.md) — navegação, troca, moderação e migração de versões.
- [Validação da versão 0.7.0](docs/validacao-0.7.0.md) — várias telas, prévia e verificações locais.
- [Validação da versão 0.8.0](docs/validacao-0.8.0.md) — consolidação, acessibilidade, bitrate e distribuição.
- [Operação e validação com o grupo](docs/operacao.md) — diagnóstico do servidor e próximos ensaios.
- [Logs de erros](docs/logs.md) — registros locais, exportação e investigação de quedas.
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
