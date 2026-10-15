import { appendFile } from 'node:fs/promises';

const signingFields = [
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'DISCORJA_PUBLISHER_NAME',
];
const configured = signingFields.filter((name) => process.env[name]?.trim());
if (configured.length > 0) {
  for (const name of signingFields) {
    if (!process.env[name]?.trim()) {
      throw new Error(`Incomplete optional signing configuration: ${name}`);
    }
  }
}

if (!/^v[0-9]+\.[0-9]+\.[0-9]+$/.test(process.env.RELEASE_TAG ?? '')) {
  throw new Error('A stable version tag such as v0.2.0 is required.');
}

const signed = configured.length > 0;
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `signed=${signed}\n`, 'utf8');
}
console.log(
  signed
    ? 'Building with code signing and publisher verification.'
    : 'Building without code signing; GitHub updates remain enabled.',
);
