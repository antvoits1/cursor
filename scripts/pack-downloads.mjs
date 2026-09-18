import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const downloads = path.join(root, 'downloads');
const stagingName = 'DeskPhone-016';
const zipName = 'DeskPhone-016.zip';

const zipFiles = [
  'index.html',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'src/App.tsx',
  'src/index.css',
  'src/main.tsx',
  'src/store.ts',
  'src/vite-env.d.ts',
  'src/lib/comm.ts',
  'src/lib/dtmf.ts',
  'src/lib/bridge.ts',
  'src/components/DeskPhone.tsx',
  'src/components/SettingsModal.tsx',
  'scripts/mock-phone-bridge.mjs',
];

function assertPresent(file) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) throw new Error(`Missing ${file}`);
  return full;
}

fs.mkdirSync(downloads, { recursive: true });
fs.rmSync(path.join(downloads, 'Forge-CRM-016-SOURCE.txt'), { force: true });
fs.rmSync(path.join(downloads, 'Forge-CRM-016.zip'), { force: true });
fs.rmSync(path.join(downloads, 'DeskPhoneCRM-016.zip'), { force: true });

const staging = path.join(downloads, stagingName);
fs.rmSync(staging, { recursive: true, force: true });
for (const file of zipFiles) {
  const dest = path.join(staging, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(assertPresent(file), dest);
}

const zipPath = path.join(downloads, zipName);
fs.rmSync(zipPath, { force: true });
const { execSync } = await import('node:child_process');
execSync(`zip -qr ${JSON.stringify(zipName)} ${JSON.stringify(stagingName)}`, { cwd: downloads });
fs.rmSync(staging, { recursive: true, force: true });

console.log(`Wrote downloads/${zipName} (${fs.statSync(zipPath).size} bytes)`);
console.log(`Zip entries: ${zipFiles.length}`);
