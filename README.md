# Extractor

[Deploy the full backend to Render](https://render.com/deploy?repo=https://github.com/antvoits1/cursor/tree/cursor/cool-white-dashboard-fd45)

The browser interface is React/Vite. Extraction planning, evidence and exports
run in the Node API, which delegates difficult page retrieval to a persistent
Python worker:

```text
React on Vercel -> Node API on Render -> curl_cffi -> Patchright -> Camoufox
```

## Deploy the full backend on Render

The repository includes two deployment profiles:

- `render.yaml` + `Dockerfile.render-free`: Render Free, with the persistent
  Python worker and `curl_cffi`.
- `Dockerfile`: a 2 GB+ host, with `curl_cffi`, Patchright and Camoufox.

1. In Render, create a **Blueprint** from this GitHub repository and branch.
2. Keep the Free instance selected. It sleeps after 15 minutes without traffic
   and can take about a minute to wake. It intentionally excludes local
   browsers because Chromium and Camoufox are not reliable in 512 MB.
3. Wait for `/api/health` to pass, then copy the service URL.
4. In the Vercel project, set `VITE_API_BASE_URL` to that Render URL for
   Production and redeploy.
5. Open Diagnostics. `curl_cffi` should report `available`; Patchright and
   Camoufox remain unavailable on the free profile.

For free browser escalation, Cloudflare Browser Run can provide remote
Chromium for up to 10 browser-minutes per day on Workers Free. It is a
different integration from Patchright/Camoufox and requires a Cloudflare
Worker plus browser binding.

### Add the free Cloudflare browser

The authenticated Worker lives in `cloudflare-browser/`.

If Cloudflare is connected to this GitHub repo, use these exact build settings:

- Root directory: leave blank
- Production branch: `cursor/cool-white-dashboard-fd45`
- Build command: `npm run cf-browser:install && npm run cf-browser:check`
- Deploy command: `npm run cf-browser:deploy`

Do not retry an old failed build from `main`. Create a new deployment after
saving those settings. After deploy succeeds, open
`https://cursor.antonvoits1.workers.dev/health` and confirm it returns
`{"ok":true,"service":"extractor-browser-renderer"}`.

Then add a Worker secret named `BROWSER_SERVICE_TOKEN` (Settings → Variables
and secrets), and set these on the Render backend:

- `CLOUDFLARE_BROWSER_URL=https://cursor.antonvoits1.workers.dev`
- `CLOUDFLARE_BROWSER_TOKEN=<same secret value>`

CLI alternative:

```bash
cd cloudflare-browser
npm ci
npx wrangler login
npx wrangler secret put BROWSER_SERVICE_TOKEN
npm run deploy
```

Cloudflare states that Browser Run traffic is identifiable as automated
traffic. This tier renders JavaScript; it does not promise to defeat CAPTCHAs
or bot protection, and the extractor continues reporting those blocks
honestly.

Optional backend variables:

- `EXTRACTOR_PROXY_URL`: residential proxy for directories that refuse
  datacenter IP addresses.
- `GEMINI_API_KEY`: Google AI Studio assistant.
- `XAI_API_KEY`: Grok assistant fallback.
- `BRAVE_SEARCH_API_KEY`: direct Brave Search API access.

Do not put these secrets in `render.yaml`; add them in Render's Environment
screen.

## Local verification

```bash
npm ci
npm run verify

docker build -f Dockerfile.render-free -t extractor-layered-free .
docker run --rm -p 10000:10000 \
  -e EXTRACTOR_ALLOWED_ORIGINS=http://localhost:5173 \
  extractor-layered-free

curl http://localhost:10000/api/health
curl http://localhost:10000/api/diagnostics
```
