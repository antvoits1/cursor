# Extractor

[Deploy the full backend to Render](https://render.com/deploy?repo=https://github.com/antvoits1/cursor/tree/cursor/cool-white-dashboard-fd45)

The browser interface is React/Vite. Extraction planning, evidence and exports
run in the Node API, which delegates difficult page retrieval to a persistent
Python worker:

```text
React on Vercel -> Node API on Render -> curl_cffi -> Patchright -> Camoufox
```

## Deploy the full backend on Render

The repository includes a Render Blueprint (`render.yaml`) and Docker image
that installs all three Python transport tiers and their browsers.

1. In Render, create a **Blueprint** from this GitHub repository and branch.
2. Review the `Standard` instance. Browser escalation needs its 2 GB of RAM;
   Render's Free and Starter instances provide only 512 MB and can be killed
   when Chromium or Camoufox starts.
3. Wait for `/api/health` to pass, then copy the service URL.
4. In the Vercel project, set `VITE_API_BASE_URL` to that Render URL for
   Production and redeploy.
5. Open Diagnostics. `curl_cffi`, `patchright` and `camoufox` should all report
   `available`.

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

docker build -t extractor-layered .
docker run --rm -p 10000:10000 \
  -e EXTRACTOR_ALLOWED_ORIGINS=http://localhost:5173 \
  extractor-layered

curl http://localhost:10000/api/health
curl http://localhost:10000/api/diagnostics
```
