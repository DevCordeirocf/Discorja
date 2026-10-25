import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const input = new URL('../assets/brand/discorja-logo.svg', import.meta.url);
const output = new URL('../src/renderer/assets/logo.png', import.meta.url);
const size = 1024;

if (!process.versions.electron) {
  // O Chromium do Electron rasteriza o SVG; o Node sozinho não tem renderizador.
  const { default: electron } = await import('electron');
  const result = spawnSync(electron, [fileURLToPath(import.meta.url)], {
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
}

const { app, BrowserWindow } = await import('electron');
const svg = readFileSync(input);
const source = `data:image/svg+xml;base64,${svg.toString('base64')}`;

async function render() {
  const window = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true },
  });
  try {
    await window.loadURL('about:blank');
    const png = await window.webContents.executeJavaScript(
      `new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = ${size};
        canvas.getContext('2d').drawImage(image, 0, 0, ${size}, ${size});
        resolve(canvas.toDataURL('image/png'));
      };
      image.onerror = () => reject(new Error('Não foi possível ler a logo.'));
      image.src = ${JSON.stringify(source)};
    })`,
    );
    writeFileSync(output, Buffer.from(png.split(',')[1], 'base64'));
    console.log(`Logo gerada: ${size}×${size} a partir de discorja-logo.svg.`);
  } finally {
    window.destroy();
  }
}

// Sem await no topo: o evento "ready" só dispara depois que o módulo principal termina.
app.disableHardwareAcceleration();
app
  .whenReady()
  .then(render)
  .then(
    () => app.exit(0),
    (error) => {
      console.error(error);
      app.exit(1);
    },
  );
