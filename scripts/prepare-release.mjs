import { mkdir, writeFile } from 'node:fs/promises';

const repository = process.env.GITHUB_REPOSITORY?.trim();
const publisherName = process.env.DISCORJA_PUBLISHER_NAME?.trim();
let release = null;
if (repository || publisherName) {
  if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository) || !publisherName) {
    throw new Error(
      'Para atualizações, configure GITHUB_REPOSITORY=owner/repo e DISCORJA_PUBLISHER_NAME.',
    );
  }
  if (!process.env.CSC_LINK?.trim()) {
    throw new Error(
      'Uma versão com atualizações exige certificado: configure CSC_LINK.',
    );
  }
  const [owner, repo] = repository.split('/');
  release = { owner, repo, publisherName };
}
await mkdir('build', { recursive: true });
await writeFile('build/release.json', JSON.stringify(release, null, 2) + '\n');
console.log(
  release
    ? 'Release assinada com atualizações do GitHub.'
    : 'Build local sem assinatura; atualizações desativadas.',
);
