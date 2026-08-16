# Equipment Catalog PWA

Mobile-first, offline-first laboratory / work-equipment inventory app.

Catalog devices on an iPhone (camera + forms), store everything locally in IndexedDB (Dexie), then export a **self-contained offline HTML catalog** you can open on a Windows PC with no server and no internet.

## Features

- Add / edit devices with Inventory IDs (`EQ-0001`, …)
- Multi-photo capture (Main, Model Label, Serial Label, Asset Tag, Additional)
- Photo compression tuned so label text stays readable
- Location / room / area autocomplete from prior entries
- **Save & Add Next** keeps location context for fast walkthroughs
- Duplicate device (clears serial / asset tag / photos)
- Auto-saved drafts while editing
- Inventory search, filters, and sorting
- Export ZIP: `index.html` + images + `inventory.json` + `inventory.xlsx`
- Full backup / restore (replace or merge)
- Optional **cloud sync** (Supabase + shared secret key, no user login)
- Installable PWA (Home Screen on iOS)
- OCR-ready interfaces (no OCR provider in v1)

## Project structure

```
src/              React PWA (IndexedDB offline store)
api/              Vercel serverless sync API (shared key → Supabase)
supabase/         SQL schema for devices + photos + storage bucket
public/           PWA icons
```

## Setup

```bash
npm install
```

## Cloud sync setup (Supabase + Vercel)

1. Create a free project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql).
3. Confirm Storage bucket `device-photos` exists (Dashboard → Storage).
4. Create a long random sync key (password manager).
5. In **Vercel → Project → Settings → Environment Variables** set:
   - `CATALOG_ACCESS_KEY` = your sync key
   - `SUPABASE_URL` = project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = service role key (server only)
6. Redeploy.
7. In the app **Data** page: paste the same key → Enable → **Sync now** (on iPhone and PC).

Local Vite (`npm run dev`) does not serve `/api`. Use the Vercel deployment (or `vercel dev`) to test sync.

See [`.env.example`](.env.example) for variable names. Never commit real keys.

## Development

```bash
npm run dev
```

Open the printed local URL (usually `http://localhost:5173`).

## Production build

```bash
npm run build
npm run preview
```

`dist/` is a static site — no backend required.

## Test from an iPhone

1. Build and host the `dist/` folder over **HTTPS** (required for reliable camera + install on iOS), e.g.:
   - GitHub Pages / Netlify / Cloudflare Pages / any static host
   - Or temporarily: `npx serve dist` on a PC and reach it via LAN IP (HTTPS preferred; see notes below)
2. On iPhone Safari, open the site.
3. Share → **Add to Home Screen**.
4. Open the Home Screen icon (standalone PWA).
5. Walk a lab: **+ Add** → fill fields → take photos → **Save & Add Next**.

### Notes for local LAN testing

- iOS camera and service workers work best over HTTPS.
- For quick LAN tests you can use a tunnel (`cloudflared`, `ngrok`) pointing at `vite preview` / `serve`.
- Data lives in that browser/PWA origin’s IndexedDB — use **Export Backup** before clearing site data.

## How the PWA should be hosted

Host the contents of `dist/` as a static website:

- HTTPS origin
- Correct MIME types for JS/CSS
- Service worker at site root scope `/`
- No server-side API needed for v1

### Vercel (recommended)

1. Import the GitHub `Catalog` repository in Vercel.
2. Framework preset: **Vite** (or Other).
3. Build command: `npm run build`
4. Output directory: `dist`
5. Deploy — `vercel.json` already rewrites SPA routes to `index.html`.

Inventory data and photos stay in each browser’s IndexedDB. They are never uploaded to Vercel or any backend.

Example with [serve](https://www.npmjs.com/package/serve):

```bash
npm run build
npx serve -s dist
```

## Exported HTML offline package

From **Data → Export Inventory Package** you get:

`EquipmentInventory_YYYY-MM-DD.zip`

```
EquipmentInventory/
  index.html          ← interactive offline catalog app
  inventory.json      ← machine-readable backup of metadata
  inventory.xlsx      ← spreadsheet
  images/
    EQ-0001/
      main.jpg
      model.jpg
      serial.jpg
      extra_01.jpg
    …
```

### How offline HTML works

- Open `index.html` by double-clicking (file://).
- Inventory JSON is **embedded inside** `index.html` (no `fetch()`, no CDN, no React).
- Images load via relative paths under `images/`.
- Search, filters, sort, accordion expand, modal device view, and lightbox all run in plain client-side JS.
- The export folder remains a complete product even if this PWA is gone later.

## Backup / restore

- **Export Backup** — ZIP with `backup.json` (devices + base64 photo blobs)
- **Import Backup** — preview counts, then **Replace** or **Merge**
- Merge remaps conflicting Inventory IDs to new `EQ-####` values

## OCR later

See `src/types/ocr.ts` — implement `OcrProvider` and call `setOcrProvider(...)`. UI can suggest manufacturer/model/serial from label photos; user confirmation remains mandatory.
