import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execSync } from 'node:child_process';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const downloads = path.join(root, 'downloads');
const stagingName = 'Forge-CRM-016';
const zipName = 'Forge-CRM-016.zip';
const sourceName = 'Forge-CRM-016-SOURCE.txt';

const zipFiles = [
  '.gitignore',
  'README.md',
  'index.html',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'scripts/pack-downloads.mjs',
  'tests/source-audit.mjs',
  'src/App.tsx',
  'src/data.ts',
  'src/index.css',
  'src/main.tsx',
  'src/store.ts',
  'src/vite-env.d.ts',
  'src/lib/comm.ts',
  'src/lib/format.ts',
  'src/lib/navigation.ts',
  'src/lib/notifications.ts',
  'src/components/IOSCommPanel.tsx',
  'src/components/LeadDetailPanel.tsx',
  'src/components/LeadsRail.tsx',
  'src/components/MessagesView.tsx',
  'src/components/NavRail.tsx',
  'src/components/NotificationPopup.tsx',
  'src/components/SettingsModal.tsx',
  'src/components/StatementDocument.tsx',
  'src/components/StatementViewerOverlay.tsx',
];

const sourceFiles = zipFiles.filter(file =>
  file !== 'package-lock.json'
  && file !== '.gitignore'
  && !file.startsWith('tests/')
  && !file.startsWith('scripts/')
);

function assertPresent(file) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) throw new Error(`Missing ${file}`);
  return full;
}

fs.mkdirSync(downloads, { recursive: true });

const source = [
  'Forge CRM 0.16 — all source in one file. Copy everything below.',
  '',
];
for (const file of sourceFiles) {
  source.push('========================================================================');
  source.push(`FILE: ${file}`);
  source.push('========================================================================');
  source.push(fs.readFileSync(assertPresent(file), 'utf8').replace(/\s+$/, ''));
  source.push('');
}
fs.writeFileSync(path.join(downloads, sourceName), `${source.join('\n').trim()}\n`);

const staging = path.join(downloads, stagingName);
fs.rmSync(staging, { recursive: true, force: true });
for (const file of zipFiles) {
  const dest = path.join(staging, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(assertPresent(file), dest);
}

const zipPath = path.join(downloads, zipName);
fs.rmSync(zipPath, { force: true });
execSync(`zip -qr ${JSON.stringify(zipName)} ${JSON.stringify(stagingName)}`, { cwd: downloads });
fs.rmSync(staging, { recursive: true, force: true });

const zipBytes = fs.statSync(zipPath).size;
const sourceBytes = fs.statSync(path.join(downloads, sourceName)).size;
console.log(`Wrote downloads/${zipName} (${zipBytes} bytes)`);
console.log(`Wrote downloads/${sourceName} (${sourceBytes} bytes)`);
console.log(`Zip entries: ${zipFiles.length}`);
