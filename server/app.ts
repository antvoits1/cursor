import express, { type Express, type Request, type Response } from 'express';
import {
  BUILD_NAME,
  BUILD_VERSION,
  extract,
  getDiagnostics,
  planQuery,
  resetEngineStats,
} from './engine.js';
import { resetLearning, snapshot as learningSnapshot } from './learning.js';
import {
  PLACEHOLDERS,
  addCustomSource,
  listCustomSources,
  removeCustomSource,
  setCustomSourceEnabled,
  sourcesArePersistent,
} from './customSources.js';
import type { ApiError, EngineDiagnostics, ExtractionResult, RouteStep } from '../src/types.js';

/** One line of the newline-delimited `/api/extract` response. */
export type ExtractStreamEvent =
  | { type: 'step'; step: RouteStep }
  | { type: 'result'; result: ExtractionResult }
  | { type: 'error'; error: string; detail?: string };

/**
 * The API surface is deliberately small. Spreadsheet parsing and export both run
 * in the browser against the same shared module, so lead sheets — which may
 * contain protected identifiers — are never uploaded anywhere.
 */

export type ApiHost = EngineDiagnostics['host'];

const MAX_QUERY_LENGTH = 400;

/**
 * The production UI and extraction service can live on different hosts.
 * Only explicitly configured browser origins receive cross-origin access;
 * same-origin requests and non-browser clients remain unaffected.
 */
function allowedOrigins(): Set<string> {
  return new Set(
    (process.env.EXTRACTOR_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  );
}

function fail(res: Response, status: number, error: string, detail?: string): void {
  const body: ApiError = detail ? { error, detail } : { error };
  res.status(status).json(body);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function createApiRouter(host: ApiHost): express.Router {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true, build: BUILD_NAME, version: BUILD_VERSION, host });
  });

  router.get('/diagnostics', async (_req, res) => {
    try {
      res.json(await getDiagnostics(host));
    } catch (error) {
      fail(res, 500, 'Diagnostics could not be collected.', (error as Error).message);
    }
  });

  // Lets the operator see the route plan before spending a run on it.
  router.post('/plan', (req: Request, res: Response) => {
    const query = asString((req.body as Record<string, unknown> | undefined)?.query).trim();
    if (!query) return fail(res, 400, 'A query is required.');
    if (query.length > MAX_QUERY_LENGTH) {
      return fail(res, 400, `A query must be ${MAX_QUERY_LENGTH} characters or fewer.`);
    }
    return res.json(planQuery(query));
  });

  /**
   * Runs one extraction.
   *
   * The response is newline-delimited JSON so the live route reaches the browser
   * while the run is still going: every line is a `step` event and the last line
   * is either a `result` or an `error`. A client that does not want the live
   * route can simply read to the end and take the final line.
   */
  router.post('/extract', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const query = asString(body.query).trim();

    if (!query) {
      return fail(res, 400, 'A query is required.', 'Send a JSON body of the form { "query": "..." }.');
    }
    if (query.length > MAX_QUERY_LENGTH) {
      return fail(res, 400, `A query must be ${MAX_QUERY_LENGTH} characters or fewer.`);
    }

    const preserved = body.preservedFields;
    const preservedFields =
      preserved && typeof preserved === 'object' && !Array.isArray(preserved)
        ? (preserved as Record<string, string | number>)
        : undefined;

    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    // Proxies that buffer would defeat the point of streaming the route.
    res.setHeader('X-Accel-Buffering', 'no');

    const send = (event: ExtractStreamEvent): void => {
      if (!res.writableEnded) res.write(`${JSON.stringify(event)}\n`);
    };

    try {
      const result = await extract(query, {
        deepScan: body.deepScan !== false,
        peopleSearch: body.peopleSearch === true,
        useAssistant: body.useAssistant !== false,
        budgetMs: typeof body.budgetMs === 'number' ? body.budgetMs : undefined,
        rowId: asString(body.rowId) || undefined,
        preservedFields,
        onStep: (step) => send({ type: 'step', step }),
      });
      send({ type: 'result', result });
    } catch (error) {
      send({ type: 'error', error: 'The extraction run failed.', detail: (error as Error).message });
    }
    return res.end();
  });

  /*
   * The extra places this installation looks.
   *
   * Saved on the server rather than in a browser, because the source list
   * belongs to the installation: one person adds a county register and
   * everybody using that server gets it, and clearing a browser does not
   * silently undo the work.
   */
  router.get('/sources', (_req, res) => {
    res.json({
      sources: listCustomSources(),
      persistent: sourcesArePersistent(),
      placeholders: PLACEHOLDERS,
    });
  });

  router.post('/sources', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const url = asString(body.url).trim();
    if (!url) return fail(res, 400, 'Enter a web address to save.');
    if (url.length > 500) return fail(res, 400, 'That web address is too long.');

    const saved = addCustomSource(url, asString(body.label));
    if (!saved.ok) return fail(res, 400, saved.problem ?? 'That address could not be saved.');
    return res.json({ ok: true, source: saved.source, sources: listCustomSources() });
  });

  router.patch('/sources/:id', (req: Request, res: Response) => {
    const enabled = (req.body as Record<string, unknown> | undefined)?.enabled;
    if (typeof enabled !== 'boolean') return fail(res, 400, 'Send { "enabled": true } or { "enabled": false }.');
    if (!setCustomSourceEnabled(req.params.id, enabled)) return fail(res, 404, 'No saved source with that id.');
    return res.json({ ok: true, sources: listCustomSources() });
  });

  router.delete('/sources/:id', (req: Request, res: Response) => {
    if (!removeCustomSource(req.params.id)) return fail(res, 404, 'No saved source with that id.');
    return res.json({ ok: true, sources: listCustomSources() });
  });

  router.get('/learning', (_req, res) => {
    res.json(learningSnapshot());
  });

  router.post('/learning/reset', (_req, res) => {
    resetLearning();
    res.json({ ok: true, learning: learningSnapshot() });
  });

  router.post('/diagnostics/reset', (_req, res) => {
    resetEngineStats();
    res.json({ ok: true });
  });

  return router;
}

/** Builds the Express application shared by the local server and the Vercel function. */
export function createApp(host: ApiHost): Express {
  const app = express();
  const browserOrigins = allowedOrigins();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    const origin = req.get('origin')?.replace(/\/+$/, '');
    if (!origin || !browserOrigins.has(origin)) {
      if (req.method === 'OPTIONS' && origin) {
        return res.status(403).json({ error: 'This browser origin is not allowed to use the extraction service.' });
      }
      return next();
    }

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  });

  app.use(express.json({ limit: '1mb' }));

  app.use('/api', createApiRouter(host));

  app.use('/api', (_req, res) => {
    fail(res, 404, 'No such API endpoint.');
  });

  // Express reports body-parser failures here; without this the client sees an
  // HTML error page instead of the JSON error shape it expects.
  app.use((error: Error, _req: Request, res: Response, _next: express.NextFunction) => {
    fail(res, 400, 'The request body could not be read.', error.message);
  });

  return app;
}
