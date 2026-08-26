import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './server/app.js';
import { BUILD_NAME, BUILD_VERSION } from './server/engine.js';
import { flushNow } from './server/learning.js';
import { shutdownWorker } from './server/transportClient.js';

/**
 * Local host process.
 *
 * In development it mounts Vite as middleware so the React app hot-reloads
 * behind the same origin as the API. In production it serves the built assets
 * from dist/. Either way the API is the same Express app the Vercel function
 * uses, so there is one implementation of every endpoint.
 */

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const requestedPort = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? '0.0.0.0';

async function attachFrontend(app: express.Express): Promise<void> {
  if (isProduction) {
    const distDir = path.join(rootDir, 'dist');
    if (!fs.existsSync(path.join(distDir, 'index.html'))) {
      throw new Error(`No production build found in ${distDir}. Run "npm run build" first.`);
    }
    app.use(express.static(distDir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
    return;
  }

  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    root: rootDir,
    server: { middlewareMode: true, allowedHosts: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

/** Finds a free port so an occupied one produces a clear message, not a crash. */
function listen(server: http.Server, port: number, attemptsLeft: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.removeListener('error', onError);
      if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
        console.warn(`Port ${port} is already in use; trying ${port + 1}.`);
        listen(server, port + 1, attemptsLeft - 1).then(resolve, reject);
        return;
      }
      reject(error);
    };
    server.once('error', onError);
    server.listen(port, hostname, () => {
      server.removeListener('error', onError);
      resolve(port);
    });
  });
}

async function main(): Promise<void> {
  const app = createApp('node_server');
  await attachFrontend(app);

  const server = http.createServer(app);
  const port = await listen(server, requestedPort, 10);
  const url = `http://localhost:${port}`;

  console.log(`${BUILD_NAME} v${BUILD_VERSION}`);
  console.log(`Mode: ${isProduction ? 'production' : 'development'}`);
  console.log(`Ready on ${url}`);

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\nReceived ${signal}; shutting down.`);
    // Flush learned route data, close the Python worker and its browsers, then
    // stop accepting connections. Nothing is left orphaned.
    flushNow();
    shutdownWorker();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: Error) => {
  console.error('The server failed to start.');
  console.error(error.message);
  process.exit(1);
});
