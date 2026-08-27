#!/usr/bin/env node
/**
 * Cross-platform production entrypoint.
 * Windows CMD cannot run `NODE_ENV=production tsx server.ts`.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.NODE_ENV = 'production';
process.env.HOST = process.env.HOST ?? '127.0.0.1';
process.env.PORT = process.env.PORT ?? '3000';

const tsxCli = path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const child = spawn(process.execPath, ['--import', 'tsx', path.join(rootDir, 'server.ts')], {
  cwd: rootDir,
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error('Failed to start Extractor:', error.message);
  console.error('Tried tsx import bootstrap. Falling back to tsx CLI if present.');
  const fallback = spawn(process.execPath, [tsxCli, path.join(rootDir, 'server.ts')], {
    cwd: rootDir,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  fallback.on('exit', (code) => process.exit(code ?? 1));
  fallback.on('error', (err) => {
    console.error(err.message);
    process.exit(1);
  });
});
