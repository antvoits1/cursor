# AA Extractor

One-click document extractor. Double-click once on Windows to download, make a Desktop shortcut, and open straight to the front page with no command window. The same app also runs on a Vercel URL from any device.

## Use it on your PC (one click)

1. Open the live app (Vercel URL) or this GitHub repo.
2. Click **Install on this PC**. That downloads `AA-Extractor-OneClick.zip`.
3. Unzip and double-click `AA-Extractor-OneClick.vbs` **once**.

That single click:

- downloads the app icon
- creates **AA Extractor** on the Desktop and in the Start Menu
- opens the front page in an Edge/Chrome app window (no command prompt)

After that, use the Desktop shortcut. It goes straight to the extractor. Files are processed in the browser and are not uploaded.

If Windows SmartScreen appears, choose **More info → Run anyway**.

You can also run the copy in [`oneclick/AA-Extractor-OneClick.vbs`](oneclick/AA-Extractor-OneClick.vbs). Put your live URL in [`oneclick/app-url.txt`](oneclick/app-url.txt) first if you are launching from the repo instead of the zip.

## Open it anywhere (Vercel)

This repo is a Next.js app. Import it in Vercel:

[Deploy with Vercel](https://vercel.com/new/clone?repository-url=https://github.com/antvoits1/cursor)

Or in the Vercel dashboard: **Add New → Project → Import** `antvoits1/cursor`. Framework preset is Next.js. After deploy you get a URL such as `https://<project>.vercel.app` that opens the front page from any browser.

Then click **Install on this PC** from that live URL so the Desktop shortcut points at it.

## What it extracts

PDF, Word (`.docx`), Excel, CSV, JSON, and text files. Labeled fields such as `Name: Jordan Lee` are pulled out automatically. Extraction runs on the device.

## Local development

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The front page is the extractor.

```bash
npm run build
```
