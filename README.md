# AA Extractor

Type anything in the front-page search box. The app searches the public web and scrapes the results onto that same page. Double-click once on Windows to put a Desktop shortcut here with no command window. The same URL also runs on Vercel from any device.

## Front page

Enter a company, person, product, or any other query. AA Extractor:

- searches DuckDuckGo and Bing
- pulls a Wikipedia / instant summary when one exists
- opens the top result pages and extracts titles, descriptions, headings, body text, emails, phones, and labeled fields
- lets you download everything as JSON

## Use it on your PC (one click)

1. Open the live app.
2. Click **Install on this PC**.
3. Unzip and double-click `AA-Extractor-OneClick.vbs` **once**.

That click downloads the icon, creates **AA Extractor** on the Desktop and Start Menu, and opens the front page in an Edge/Chrome app window (no command prompt). After that, use the shortcut.

If Windows SmartScreen appears, choose **More info → Run anyway**.

## Open it anywhere (Vercel)

Import `antvoits1/cursor` in the Vercel dashboard, or use:

[Deploy with Vercel](https://vercel.com/new/clone?repository-url=https://github.com/antvoits1/cursor)

Then click **Install on this PC** from the live URL so the Desktop shortcut points at it.

## Local development

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), type a search, press Enter.
