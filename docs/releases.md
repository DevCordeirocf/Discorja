# Instaladores e atualizações no Windows

Este guia prepara a distribuição para Windows 10/11 x64, com instalador NSIS assinado e atualizações pelo GitHub Releases. A assinatura com certificado real e a atualização entre duas versões instaladas ainda precisam ser validadas no ambiente de distribuição. Testes locais de captura/WebRTC não validam esse fluxo.

## Como a atualização funciona

O aplicativo instalado precisa ter sido empacotado com repositório e publicador configurados. Ele consulta atualizações aproximadamente cinco segundos após abrir e permite uma nova consulta em **Configurações → Verificar atualizações**. Uma versão estável mais recente é baixada automaticamente. Depois da validação, o usuário sai da sala e usa **Reiniciar e instalar**. Fechar o aplicativo normalmente não instala a atualização; o processo principal impede a instalação durante uma transmissão.

O pacote local padrão, sem configuração de release nem credenciais de assinatura, gera um instalador sem assinatura e com atualizações desativadas. Essa instalação **não passa a receber atualizações só porque uma release assinada foi publicada**: instale manualmente o primeiro instalador assinado e configurado. As próximas versões compatíveis podem chegar pelo atualizador.

A atualização desktop não hospeda nem atualiza a sinalização. O endereço do servidor e os serviços STUN/TURN são configurações separadas; veja [implantação](implantacao.md).

## 1. Preparar um repositório público

O workflow incluído publica no **mesmo repositório que contém o código e o workflow**. Ele recebe `GITHUB_REPOSITORY=proprietario/repositorio` automaticamente do GitHub. O aplicativo consulta esse destino sem token de autenticação: o repositório e os artefatos precisam estar acessíveis publicamente.

`private: false` no electron-builder não altera a visibilidade de um repositório privado. Manter código privado e distribuir por outro repositório público exige adaptar workflow, destino e credenciais; esse arranjo não está configurado no fluxo padrão.

Crie um repositório público vazio no GitHub. Envie `main` incluindo `.github/workflows/release.yml`, `package-lock.json` e os recursos em `build/`. Confira `git status --short` e mantenha certificados, senhas e arquivos de ambiente pessoais fora dos arquivos versionados.

Exemplo para uma pasta nova, ainda sem repositório Git nem remoto:

```powershell
git init -b main
git status --short
git add .
git commit -m "Prepara Discorja para distribuição"
git remote add origin https://github.com/SEU_USUARIO/Discorja.git
git push -u origin main
```

Se já houver commits ou remoto `origin`, confira `git remote -v` e use a configuração existente. Não repita a configuração do remoto a cada versão.

Habilite GitHub Actions. O workflow deve existir na branch padrão para aparecer **Run workflow**; neste guia, a branch padrão é `main`. Consulte os [eventos manuais do GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch).

## 2. Preparar a assinatura do Windows

O fluxo espera um certificado Authenticode de assinatura de código, com chave privada utilizável pelo electron-builder no runner Windows. No caminho PFX abaixo, o arquivo e a senha precisam permitir assinatura no ambiente de CI.

Não pressuponha que todo certificado seja exportável como PFX: token, HSM ou assinatura remota podem exigir provedor e etapa de assinatura diferentes. Adapte o fluxo ao certificado disponível; converter um arquivo em base64 não torna uma chave de hardware exportável. A referência deste projeto é o [electron-builder v26 para Windows](https://www.electron.build/v26/docs/win/).

O publicador precisa corresponder ao certificado: nome comum, CN, ou nome distinto, DN, compatível com o atualizador. Quando possível, use o DN completo e mantenha a identidade esperada pelas versões já instaladas. Renovar certificado ou mudar publicador exige testar a atualização a partir da versão anterior; a configuração não fixa o thumbprint do certificado.

## 3. Cadastrar variável e segredos no Actions

Em **Settings → Secrets and variables → Actions** do repositório, configure:

| Tipo                | Nome                      | Conteúdo                                                  |
| ------------------- | ------------------------- | --------------------------------------------------------- |
| Repository variable | `DISCORJA_PUBLISHER_NAME` | CN ou DN exato do publicador no certificado. Não é senha. |
| Repository secret   | `CSC_LINK`                | Conteúdo do PFX em base64, para o fluxo de CI incluído.   |
| Repository secret   | `CSC_KEY_PASSWORD`        | Senha do PFX. O workflow exige valor não vazio.           |

Um caminho local em `CSC_LINK` não funciona no runner, onde esse arquivo não existe. Base64 representa o arquivo, sem criptografá-lo; continue tratando o conteúdo como segredo. Veja as [variáveis de assinatura do electron-builder v26](https://www.electron.build/v26/docs/features/code-signing/#environment-variables).

Para cadastrar um PFX sem imprimir seu conteúdo nem gerar um arquivo base64, use o GitHub CLI já autenticado:

```powershell
$releaseRepository = 'SEU_USUARIO/Discorja'
$certificatePath = 'C:\segredos\Discorja.pfx'

[Convert]::ToBase64String([IO.File]::ReadAllBytes($certificatePath)) |
  gh secret set CSC_LINK --repo $releaseRepository

# O CLI solicita o valor; não escreva a senha no comando.
gh secret set CSC_KEY_PASSWORD --repo $releaseRepository

gh variable set DISCORJA_PUBLISHER_NAME --repo $releaseRepository --body 'CN=Nome do publicador, O=Organização, C=BR'

# Lista nomes e datas, sem revelar os valores dos segredos.
gh secret list --repo $releaseRepository
```

Substitua o DN de exemplo pelo do certificado. Esses comandos cadastram dados na sua conta quando você os executar; o projeto não os executa automaticamente. Consulte o [manual de gh secret set](https://cli.github.com/manual/gh_secret_set).

Não é necessário criar um PAT chamado `GH_TOKEN`: o workflow fornece essa variável a partir de `${{ secrets.GITHUB_TOKEN }}` somente na etapa de envio. O job pede `contents: write`, operação que a política do repositório/organização precisa permitir. Nenhum token é incluído no instalador.

## 4. Preparar uma versão estável

O valor atual está em `package.json`. Para uma próxima versão, por exemplo `0.2.1`:

```powershell
npm version 0.2.1 --no-git-tag-version
npm ci
npm run typecheck
npm run format:check
npm test
npm run build
```

`npm version` mantém pacote e lockfile sincronizados. Revise e faça commit desses arquivos e das demais mudanças, depois envie a branch:

```powershell
git add .
git commit -m "Prepara versão 0.2.1"
git push origin main
```

Para testar atualização, use uma versão maior que a instalada. O workflow aceita somente tags estáveis `vX.Y.Z`, como `v0.2.1`, iguais à versão do pacote. Prereleases como `v0.2.1-beta.1` não são aceitas. Não crie uma branch com o mesmo nome da tag.

## 5. Disparar o build e publicar o rascunho

Escolha uma das formas:

**Envio da tag:** crie a tag no commit da versão e envie-a. O push dispara **Release Windows** automaticamente.

```powershell
git tag v0.2.1
git push origin v0.2.1
```

**Botão manual:** em **Actions → Release Windows → Run workflow**, selecione a branch do workflow e informe uma tag **já existente no remoto**, como `v0.2.1`. O input não cria a tag nem muda a versão. Essa opção também permite repetir um build de uma tag já enviada.

O workflow valida configuração e versão, executa verificações, gera o NSIS assinado, verifica Authenticode e confere o publicador. Depois envia os artefatos a um **rascunho** de GitHub Release. Um rascunho existente pode receber os arquivos novamente; uma release publicada é recusada. Para corrigir uma versão publicada, prepare uma versão nova.

Os arquivos em `release/` precisam vir do mesmo build:

| Arquivo                             | Função                                                    |
| ----------------------------------- | --------------------------------------------------------- |
| `Discorja-Setup-0.2.1.exe`          | Instalador assinado.                                      |
| `Discorja-Setup-0.2.1.exe.blockmap` | Metadados do download diferencial.                        |
| `latest.yml`                        | Versão, nomes, tamanhos e hashes usados pelo atualizador. |

O nome do instalador acompanha a versão real. Não misture arquivos de versões diferentes nem edite `latest.yml` à mão. Veja [publicação no electron-builder v26](https://www.electron.build/v26/docs/publish/).

Em **Releases**, revise o rascunho e teste o instalador. Depois use **Publish release**, como versão estável. Um rascunho não fica disponível ao atualizador. O workflow não executa essa última publicação por você.

## 6. Instalar a primeira versão e testar a próxima

1. Baixe o `.exe` da primeira release assinada e publicada. Execute-o e conclua a instalação por usuário no Windows.
2. Abra o aplicativo instalado, configure a sinalização e confira a versão em **Configurações**. `npm run dev` e `npx electron .` não ativam o atualizador de produção.
3. Prepare, assine, teste e publique uma segunda versão, maior, com destino e publicador compatíveis.
4. Abra a primeira versão instalada. Aguarde a consulta inicial ou use **Verificar atualizações** e acompanhe o download.
5. Encerre ou saia da sala e use **Reiniciar e instalar**. Confira a versão depois que o aplicativo abrir.

Teste também falta de rede, ausência de versão nova e rejeição de assinatura incompatível em ambiente de teste. Mantenha `verifyUpdateCodeSignature: true`. Uma assinatura válida precisa de cadeia de confiança aceita pelo Windows; um certificado de teste não comprova distribuição pública. Não há garantia de ausência de avisos de reputação do Windows.

O teste entre duas instalações é necessário para considerar o fluxo validado. Consulte as [instruções de atualização do electron-builder v26](https://www.electron.build/v26/docs/features/auto-update/).

## Empacotar localmente sem enviar ao GitHub

No PowerShell, com certificado real e dados corretos:

```powershell
$env:GITHUB_REPOSITORY = 'SEU_USUARIO/Discorja'
$env:DISCORJA_PUBLISHER_NAME = 'CN=Nome do publicador, O=Organização, C=BR'
$env:CSC_LINK = 'C:\segredos\Discorja.pfx'

# Solicita a senha sem incluí-la no histórico de comandos.
$certificatePassword = Read-Host 'Senha do PFX' -AsSecureString
$passwordHandle = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($certificatePassword)
try {
  $env:CSC_KEY_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordHandle)
  npm run dist:win -- --publish never
  if ($LASTEXITCODE -ne 0) { throw 'O empacotamento falhou; confira o diagnóstico acima.' }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordHandle)
  Remove-Item Env:\CSC_KEY_PASSWORD -ErrorAction SilentlyContinue
  Remove-Variable certificatePassword,passwordHandle -ErrorAction SilentlyContinue
}
```

Esse comando não envia artefatos. Os scripts de release leem o ambiente do processo; não carregam `.env` automaticamente. Use `npm run dist:win`, que prepara metadados antes do build, em vez de chamar electron-builder diretamente com metadados antigos.

Para gerar novamente o pacote local sem atualizações, use um terminal sem `GITHUB_REPOSITORY` e `DISCORJA_PUBLISHER_NAME` e sem credenciais de assinatura. Não versione nem edite `build/release.json`: `scripts/prepare-release.mjs` gera `{ owner, repo, publisherName }` ou `null`, e o build copia para `dist/electron/release.json` no pacote.

`CSC_NAME` não é alternativa de assinatura Windows no fluxo padrão: no electron-builder v26, ela escolhe identidades do macOS. Um certificado no repositório de certificados do Windows exige `win.signtoolOptions.certificateSubjectName`/`certificateSha1` e compatibilização do script de preparação. Hardware ou assinatura remota também exigem adaptação; não basta definir essa variável.

## Diagnóstico

| Sintoma                              | Conferir                                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Workflow não aparece                 | Arquivo na branch padrão e Actions habilitado.                                                                              |
| Falta configuração de assinatura     | Variable `DISCORJA_PUBLISHER_NAME` e secrets `CSC_LINK`/`CSC_KEY_PASSWORD` no repositório, com valores não vazios.          |
| PFX não encontrado ou senha inválida | Em CI, PFX em base64; localmente, caminho real. Verifique compatibilidade da chave e senha.                                 |
| Assinatura ou publicador inválido    | Certificado usado, confiança da cadeia no runner e CN/DN configurado. Mantenha a verificação ligada.                        |
| Erro de tag/versão                   | Tag remota existente, formato `vX.Y.Z`, pacote e lockfile sincronizados e commit correto.                                   |
| Erro ao enviar arquivos              | Permissão `contents: write`, política do repositório, destino e release ainda como rascunho.                                |
| Atualizações desativadas             | Pacote local sem configuração ou execução em desenvolvimento. Instale manualmente a primeira versão assinada e configurada. |
| Nenhuma versão nova encontrada       | Repositório público correto, release publicada/estável, versão maior e `latest.yml` acessível junto dos arquivos.           |
| Falha de download ou validação       | Arquivos do mesmo build, hashes, assinatura/publicador esperado e acesso à rede.                                            |
| Reinício indisponível                | Download incompleto ou usuário ainda em uma sala/transmissão.                                                               |

Mudança de nome, repositório ou certificado precisa considerar o que já está gravado nas instalações existentes. Uma configuração nova no código não muda o destino que um aplicativo antigo consulta antes de atualizar.
