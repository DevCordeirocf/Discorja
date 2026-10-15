import { mkdir, writeFile } from 'node:fs/promises';

const repository = process.env.GITHUB_REPOSITORY?.trim();
const publisherName = process.env.DISCORJA_PUBLISHER_NAME?.trim();
const certificate = process.env.CSC_LINK?.trim();
let release = null;
if (repository || publisherName || certificate) {
  if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new Error(
      'Para atualizações, configure GITHUB_REPOSITORY=owner/repo.',
    );
  }
  if (Boolean(publisherName) !== Boolean(certificate)) {
    throw new Error(
      'A assinatura é opcional. Para assinar, configure CSC_LINK e DISCORJA_PUBLISHER_NAME em conjunto.',
    );
  }
  const [owner, repo] = repository.split('/');
  release = { owner, repo, ...(publisherName ? { publisherName } : {}) };
}
await mkdir('build', { recursive: true });
await writeFile('build/release.json', JSON.stringify(release, null, 2) + '\n');
console.log(
  release
    ? publisherName
      ? 'Release assinada com atualizações do GitHub.'
      : 'Release sem assinatura com atualizações do GitHub.'
    : 'Build local sem assinatura; atualizações desativadas.',
);
