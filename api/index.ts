import { createApp } from '../server/app.js';

/**
 * Vercel serverless entry point.
 *
 * Only the Node-native transport tier can run here: serverless functions are
 * short-lived and have no browser runtime, so the Python worker is never
 * started. Diagnostics report that honestly rather than claiming tiers that do
 * not exist. Point EXTRACTOR_API_BASE_URL at a persistent host to get the full
 * curl_cffi / Patchright / Camoufox ladder.
 */

process.env.EXTRACTOR_DISABLE_PYTHON_TRANSPORT = '1';

export default createApp('vercel_function');
