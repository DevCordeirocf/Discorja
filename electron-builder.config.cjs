const { readFileSync } = require('node:fs');
let release = null;
try {
  release = JSON.parse(readFileSync('build/release.json', 'utf8'));
} catch {}

module.exports = {
  appId: 'app.discorja.desktop',
  productName: 'Discorja',
  directories: { output: 'release', buildResources: 'build' },
  files: ['dist/electron/**', 'dist/renderer/**', 'package.json'],
  asar: true,
  artifactName: 'Discorja-Setup-${version}.${ext}',
  forceCodeSigning: Boolean(release?.publisherName),
  publish: release
    ? [
        {
          provider: 'github',
          owner: release.owner,
          repo: release.repo,
          private: false,
          releaseType: 'draft',
        },
      ]
    : null,
  win: {
    icon: 'build/icon.ico',
    target: [{ target: 'nsis', arch: ['x64'] }],
    verifyUpdateCodeSignature: true,
    ...(release?.publisherName
      ? { signtoolOptions: { publisherName: release.publisherName } }
      : {}),
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
  },
};
