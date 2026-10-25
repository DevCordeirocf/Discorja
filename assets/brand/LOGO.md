# Logo do Discorja

A logo oficial é o mascote Forja: uma cabeça larga com chifres pequenos no contorno e olhos vazados, em branco sobre um círculo lilás profundo.

- Fonte vetorial: `discorja-logo.svg` (gradiente `#8263e6` → `#5a38c4`, símbolo `#ffffff`).
- `node scripts/process-logo.mjs` gera `src/renderer/assets/logo.png` (1024×1024, fundo transparente) a partir do SVG usando o Chromium do Electron.
- `npm run build` gera `build/icon.ico` e `build/icon.png` a partir de `logo.png` por meio de `scripts/generate-icon.ps1`.
- A abertura do app posiciona o brilho dos olhos (`.startup-eye-glow` em `src/renderer/styles/app-shell.css`) sobre os olhos desta arte. Ajuste essas porcentagens se a geometria do SVG mudar.

A antiga caveira com chifres (`discorja-grafite-*.png`, descrita em `CORES-CHIFRES.md`) fica apenas como histórico.
