# Instaladores e atualizações no Windows

O Discorja gera um instalador NSIS para Windows 10/11 x64 e recebe atualizações pelo GitHub Releases. **A assinatura de código é opcional.** O caminho padrão funciona sem certificado; o caminho assinado acrescenta verificação da identidade do publicador.

## Modos de distribuição

| Modo                  | Configuração                                                                          | Atualizações                                                        |
| --------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Teste local           | Sem `GITHUB_REPOSITORY` nem dados de assinatura                                       | Desativadas, pois não há destino de distribuição.                   |
| GitHub sem assinatura | `GITHUB_REPOSITORY=owner/repo`; sem certificado/publicador                            | Habilitadas no aplicativo empacotado Windows.                       |
| GitHub com assinatura | Repositório, `CSC_LINK` e `DISCORJA_PUBLISHER_NAME`; senha do certificado no ambiente | Habilitadas, com verificação adicional da assinatura do publicador. |

Todos os downloads de atualização passam pela conferência de integridade do `electron-updater`. Sem assinatura, essa conferência compara o arquivo com o manifesto, mas não comprova a identidade do publicador. Com assinatura configurada, a verificação Windows permanece habilitada. Um instalador sem assinatura pode apresentar avisos do Windows; assinar também não garante reputação imediata no SmartScreen.

## Preparar o repositório

O fluxo usa o mesmo repositório que contém o código, atualmente `DevCordeirocf/Discorja`. Confirme que ele está público: os aplicativos baixam versões sem token de acesso. `private: false` no builder não muda a visibilidade de um repositório privado. Distribuir por outro repositório exige adaptar destino, permissões e workflow.

Envie o código e os workflows para `main` e habilite GitHub Actions. O workflow manual precisa existir na branch padrão para aparecer em **Run workflow**. O job declara `contents: write`; políticas do repositório/organização precisam permitir a escrita de Releases. Os procedimentos de commit e primeiro envio estão no [guia de desenvolvimento](desenvolvimento.md#preparar-e-enviar-ao-github).

`GITHUB_REPOSITORY` e `secrets.GITHUB_TOKEN` são fornecidos pelo GitHub automaticamente. O token é usado somente para enviar os artefatos no Actions; não o inclua no aplicativo.

A validação inicial de assinatura e formato da tag usa `scripts/validate-release.mjs`, executado com Node.js após o checkout e a preparação do runtime no workflow. Os testes dessa validação também usam Node.js e não exigem instalar PowerShell 7 (`pwsh`) no computador de desenvolvimento.

## Publicar sem certificado

Não cadastre `DISCORJA_PUBLISHER_NAME`, `CSC_LINK` ou `CSC_KEY_PASSWORD` no Actions para este modo. Se já cadastrou parte desses dados, remova a configuração incompleta ou complete o conjunto para usar assinatura.

1. Faça commit e envie a versão desejada. `package.json`, `package-lock.json` e tag devem concordar.
2. Para publicar a versão atual, crie e envie `v0.2.0`, se a tag ainda não existir:

```powershell
git tag v0.2.0
git push origin v0.2.0
```

3. Acompanhe **Actions → Release Windows**. O workflow verifica a versão, executa testes, gera o instalador sem assinatura e prepara os artefatos de atualização.
4. Abra o rascunho em **Releases**, baixe e teste o instalador.
5. Use **Publish release**, sem marcar como pré-release. Enquanto for rascunho, o atualizador não encontrará a versão.

O workflow pode ser iniciado manualmente em **Run workflow**, informando uma tag já existente no remoto. Ele aceita somente `vX.Y.Z`, igual à versão do pacote. Um rascunho existente pode receber os arquivos novamente; o fluxo recusa alterar releases já publicadas. Para corrigir uma publicação, prepare uma versão maior.

### Preparar a próxima versão

Por exemplo, para passar de 0.2.0 para 0.2.1:

```powershell
npm version 0.5.0 --no-git-tag-version
npm run typecheck
npm run format:check
npm test
git add .
git commit -m "Prepara versão 0.5.0"
git push origin main
git tag v0.5.0
git push origin v0.5.0
```

Revise os arquivos antes de adicioná-los. `npm version` sincroniza pacote e lockfile. Mantenha `appId`, repositório e nome do produto estáveis para preservar o caminho de instalação e atualização.

## Empacotar localmente com atualizações habilitadas

No PowerShell, em um terminal sem credenciais de assinatura ou publicador definidos:

```powershell
$env:GITHUB_REPOSITORY = 'DevCordeirocf/Discorja'
npm run dist:win -- --publish never
```

Esse comando gera o instalador e os metadados sem enviar arquivos ao GitHub. Para a versão atual, os principais resultados são:

| Arquivo                                     | Função                                                    |
| ------------------------------------------- | --------------------------------------------------------- |
| `release/Discorja-Setup-0.2.0.exe`          | Instalador Windows.                                       |
| `release/Discorja-Setup-0.2.0.exe.blockmap` | Metadados para download diferencial.                      |
| `release/latest.yml`                        | Versão, localização e hashes utilizados pelo atualizador. |

Mantenha os três arquivos da mesma compilação. Não edite o manifesto à mão nem misture versões. Sem `GITHUB_REPOSITORY`, o mesmo comando produz um pacote local sem destino de atualização. Os comandos de build não carregam `.env` automaticamente.

`scripts/prepare-release.mjs` gera `build/release.json` com `{ owner, repo }` e, somente quando configurado, `publisherName`. O build inclui esses dados públicos no pacote. Não versione nem edite o arquivo gerado.

## Como o aplicativo atualiza

O aplicativo Windows empacotado com destino de distribuição consulta versões cerca de cinco segundos após abrir. Quando encontra versão estável maior, mostra um popup com versão instalada/nova, **Atualizar agora** e **Depois**. O download começa pela ação do usuário, mostra progresso e termina com a opção **Reiniciar e atualizar**. Adiar permite continuar usando o app e evita repetir o popup na mesma execução; ele pode reaparecer na próxima abertura.

Também há **Configurações → Verificar atualizações**, download manual e acesso à atualização pronta. A confirmação de reinício avisa sobre sala/transmissão ativa e encerra a participação antes de instalar. Fechar normalmente não instala. Sem internet ou com pacote inválido, o app continua utilizável; não há atualização obrigatória ou downgrade automático. O servidor de sinalização não pode indicar instaladores nem disparar a atualização.

**Pacotes antigos com atualizações desativadas precisam receber manualmente a primeira instalação configurada**, com ou sem assinatura. Publicar no GitHub não adiciona um destino a uma instalação antiga que não o possui. Feche o app, instale a nova distribuição e confira a versão.

Para validar de ponta a ponta, instale uma versão configurada e publique uma segunda versão maior. Abra a anterior e confira consulta, download, reinício e versão final. Teste também falta de rede e ausência de versão nova. Os testes locais de mídia não substituem esse ensaio com releases reais.

## Ativar assinatura depois — opcional

Quando tiver um certificado compatível com o fluxo de assinatura, configure em **Settings → Secrets and variables → Actions**:

| Tipo                | Nome                      | Conteúdo                                                                 |
| ------------------- | ------------------------- | ------------------------------------------------------------------------ |
| Repository variable | `DISCORJA_PUBLISHER_NAME` | Nome comum (CN) ou nome distinto (DN) exato do publicador.               |
| Repository secret   | `CSC_LINK`                | Conteúdo do certificado PFX/P12 em base64, compatível com o runner.      |
| Repository secret   | `CSC_KEY_PASSWORD`        | Senha do certificado; o workflow exige valor não vazio no modo assinado. |

Se nenhum desses campos estiver configurado, o workflow usa o modo sem assinatura. Se qualquer um estiver definido, exige os três, assina e verifica Authenticode e publicador antes de enviar. Falha de assinatura não deve resultar silenciosamente em um pacote sem assinatura.

Certificados modernos podem manter a chave em token/HSM ou serviço de assinatura remota. Eles precisam de integração própria: **não pressuponha que haverá um PFX exportável**. O caminho incluído atende credenciais compatíveis com `CSC_LINK`. Certificado TLS do servidor não é certificado de assinatura de código.

Para cadastrar um PFX compatível sem imprimir o conteúdo, usando GitHub CLI já autenticado:

```powershell
$releaseRepository = 'DevCordeirocf/Discorja'
$certificatePath = 'C:\segredos\Discorja.pfx'
[Convert]::ToBase64String([IO.File]::ReadAllBytes($certificatePath)) |
  gh secret set CSC_LINK --repo $releaseRepository
gh secret set CSC_KEY_PASSWORD --repo $releaseRepository
gh variable set DISCORJA_PUBLISHER_NAME --repo $releaseRepository --body 'CN=Nome do publicador, O=Organização, C=BR'
```

Substitua os exemplos pelo certificado real. Base64 não criptografa a chave. Esses comandos cadastram os valores quando você os executar; não são executados pelo projeto automaticamente.

Localmente, exporte `GITHUB_REPOSITORY`, `DISCORJA_PUBLISHER_NAME`, `CSC_LINK` e a senha pelo mecanismo seguro do ambiente antes de `npm run dist:win -- --publish never`. `CSC_NAME` não substitui esse fluxo Windows. Certificado no armazenamento do Windows ou assinatura em nuvem exige adaptação dos scripts e da configuração do builder.

### Compatibilidade entre os modos

Uma versão sem assinatura pode receber uma versão assinada pelo mesmo destino. A versão antiga verifica o hash; a nova instalação passa a exigir o publicador configurado para suas atualizações seguintes. Depois de adotar assinatura, mantenha-a nas versões posteriores: **uma instalação que exige um publicador não deve aceitar uma atualização sem assinatura**. Voltar ao modo sem assinatura requer reinstalação manual ou planejamento específico de migração.

Renovar certificado ou mudar publicador exige testar compatibilidade a partir das instalações existentes. A assinatura real, sua confiança no Windows e a atualização entre duas versões assinadas ainda dependem de validação com o certificado escolhido.

## Diagnóstico

| Sintoma                            | Conferir                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Workflow não aparece               | Arquivo na branch padrão e Actions habilitado.                                                          |
| Configuração parcial de assinatura | Sem certificado, remova os três campos opcionais; para assinar, complete todos.                         |
| Erro de tag                        | Tag existente, estável `vX.Y.Z`, igual ao pacote, com lockfile sincronizado.                            |
| Erro no envio                      | Permissão `contents: write` e release ainda em rascunho.                                                |
| Atualizações desativadas           | Desenvolvimento ou pacote sem repositório configurado; instale a primeira distribuição configurada.     |
| Não encontra versão                | Release pública, publicada, estável e maior que a instalada; manifesto e arquivos acessíveis.           |
| Download/validação falha           | Arquivos da mesma compilação, hash, rede e, se exigido pela instalação, assinatura/publicador.          |
| Reinício indisponível              | Download incompleto ou pacote não validado. A ação de reiniciar pede confirmação antes de sair da sala. |

A atualização desktop não implanta a sinalização. A operação do servidor é descrita em [implantação](implantacao.md).

Referências: [atualizações no electron-builder v26](https://www.electron.build/v26/docs/features/auto-update/), [assinatura Windows](https://www.electron.build/v26/docs/features/code-signing/code-signing-win/) e [GitHub CLI](https://cli.github.com/manual/gh_secret_set).
