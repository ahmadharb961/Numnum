# numnum

Video-first food discovery and WhatsApp ordering for Lebanon — a mobile-first web app (installable PWA), not a native app.

**Customer flow:** watch food reels → open the dish → customize → add to cart → enter delivery details → send the order to the restaurant on WhatsApp. No account, no online payment.

**Restaurant flow:** register → import menu (CSV) → upload photos (ZIP / bulk, matched by SKU) → upload reels linked to dishes → acknowledge order requests → review monthly commission invoice → pay via Whish → upload proof.

**Admin:** restaurant approval and verification, moderation, commission ledger, monthly invoicing, Whish payment reconciliation, disputes, adjustments, global settings, audit log.

---

## Stack

| Layer | Choice |
| --- | --- |
| Web | Next.js 15 (App Router, Server Components, Server Actions), React 19, TypeScript, Tailwind CSS |
| Data | PostgreSQL + Prisma (migrations in `prisma/migrations`) |
| Auth | Session cookies (httpOnly, hashed tokens in DB), bcrypt, role-based access (customer / restaurant staff: owner, manager, staff / admin) |
| Media | `sharp` image pipeline (EXIF rotate, metadata strip, resize without distortion, WebP + thumbnails). `ffmpeg` video pipeline (H.264/AAC 720p, faststart, poster frame). Storage: local disk (default) or Cloudinary for public media |
| Jobs | DB-backed job queue (`jobs` table) for video processing; scheduled endpoint for billing |
| Documents | `pdf-lib` invoice PDFs, CSV statements/exports |

## Key business rules (where they live)

| Rule | Implementation |
| --- | --- |
| Prices never trusted from the browser | `src/server/orders.ts` → `priceCart()` re-prices from DB and re-validates customizations (`src/lib/customization.ts`, shared with the UI) |
| Immutable financial snapshots | `orders`, `order_items`, `order_item_customizations` store names/prices at order time; commission events store base, rate and amount |
| Money is integer minor units | `src/lib/money.ts` (`calcCommission` = base × bps / 10000, half-up to the cent). LBP menus use an explicit admin-set exchange rate stored on each order |
| WhatsApp opening ≠ message sent | Order states: `LINK_GENERATED` → `HANDOFF_ATTEMPTED` → (`MESSAGE_CONFIRMED` only with a verified integration) → `ACKNOWLEDGED` → `ACCEPTED` / `REJECTED` → `FULFILLED` |
| Billable event (default: restaurant acknowledgment) | `src/server/commission.ts` → `ensureCommission()`; configurable in Admin → Settings |
| Exactly one commission per order | Unique index on `commission_events.orderId` + `INSERT … ON CONFLICT DO NOTHING`; orders use an idempotency key, so repeated taps or refreshes return the same order |
| Monthly invoices, never silently edited | `src/server/billing.ts` → `generateInvoice()` (unique per restaurant + period, sequential numbers). Corrections are adjustment/credit lines |
| Payment is "submitted", never auto-"paid" | `submitPayment()` → `PAYMENT_SUBMITTED`; only `reviewPayment()` by an admin adds verified money |
| Tenant isolation | Every restaurant query is scoped by the session's restaurant; receipts/documents are served only through `/api/private-media/[id]` with ownership checks |
| No deletion on CSV re-import | `commitImport()` updates by SKU, preserves photos/reels/reviews/customizations; archiving missing items is a separate confirmed step |

## Local development

Requirements: Node 20+, PostgreSQL 14+, `ffmpeg` and `ffprobe` on the PATH.

```bash
cp .env.example .env          # set DATABASE_URL, SESSION_SECRET
npm install
npx prisma migrate deploy
SEED_DEMO=true npm run db:seed   # demo data; omit SEED_DEMO for categories + admin only
npm run dev
```

The demo seed builds generated photos and videos, runs real orders through the order/commission/billing services, and issues an invoice with a pending Whish payment.

| Demo login | Password |
| --- | --- |
| `admin@numnum.app` | `admin1234` |
| `owner@burgerhouse.demo` (also `owner@manousheh.demo`, `owner@shawarma.demo`, `owner@forno.demo`, `owner@beanbar.demo`, `owner@ashta.demo`) | `demo1234` |
| `customer@numnum.demo` | `demo1234` |

Demo content is for development and demo environments only. In production, seed with `ADMIN_EMAIL` and `ADMIN_PASSWORD` and leave `SEED_DEMO` unset.

## Tests

```bash
npm test            # unit + Postgres integration tests (uses TEST_DATABASE_URL, default …/numnum_test; must end in _test)
npm run typecheck
npm run test:e2e    # Playwright browser journeys against a running, demo-seeded server on :3000
```

Covered: commission math (a $20 order → $2.80 at 14%), exactly-once commission under concurrent acknowledgments, repeated WhatsApp handoffs creating no commission, idempotent order submission, client-price tampering, cross-restaurant item injection, restaurant isolation for orders/invoices/payments, monthly invoicing (idempotent, refuses open periods), Whish approval and partial payments, dispute credits, CSV validation including Arabic/UTF-8 and encodings, SKU photo matching for 150 files, feed diversity.

The E2E scripts cover the full guest order journey to the WhatsApp deep link, a 150-item CSV import, a 150-photo ZIP upload, acknowledgment by order reference, admin payment verification, and an error sweep of every dashboard and admin page.

## Deploy on Render (quickest path)

The repo includes `render.yaml`, a `Dockerfile` (Node 22 + ffmpeg) and `scripts/start.sh` (runs migrations, optional seed, then serves).

1. Merge this branch into your default branch, or select it while creating the Blueprint.
2. At [render.com](https://render.com): **New → Blueprint**, connect the GitHub repo. Render creates the Postgres database, the web service (with a 10 GB disk for photos and videos) and an hourly billing cron job.
3. When prompted, fill in `ADMIN_EMAIL` and `ADMIN_PASSWORD` (your admin login), and `APP_URL` (e.g. `https://numnum.onrender.com`, or your own domain later) on both the web service and the cron job.
4. To load the demo restaurants, set `SEED_DEMO=true` before the first deploy. Leave it `false` for a clean launch.
5. After the first deploy, open `APP_URL/login`, sign in as admin, and fill in Admin → Settings (Whish recipient details, etc.).
6. Custom domain: Render service → Settings → Custom Domains, then update `APP_URL`.

Any Docker host works the same way: build the `Dockerfile`, then provide `DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET` and `APP_URL`, mount a persistent volume at `/data`, and call `/api/cron` hourly.

## Deployment

1. **Database:** managed PostgreSQL with automated daily backups and point-in-time recovery. Run `npx prisma migrate deploy` on each release.
2. **Environment:** see `.env.example`. Required: `DATABASE_URL`, `APP_URL`, `SESSION_SECRET` (64+ random characters), `CRON_SECRET`. Never commit secrets.
3. **Build and run:** `npm ci && npm run build && npm start` on a Node host with `ffmpeg` installed. The included `npm start` serves on `$PORT`. HTTPS terminates at your load balancer or CDN.
4. **Worker:** run `npm run worker` as a separate process so video transcoding doesn't compete with web traffic. Set `INLINE_JOBS=false` on web instances when a worker runs.
5. **Scheduler:** call `GET /api/cron` hourly with `Authorization: Bearer $CRON_SECRET`. It processes jobs, issues the previous month's invoices on the 1st–3rd (idempotent), refreshes overdue statuses, sends reminders and applies the configured overdue policy. `npm run billing:run [-- YYYY-MM]` does the same from a shell.
6. **Media:** local storage writes to `STORAGE_DIR` (`public/` and `private/`). Use a persistent volume and put a CDN in front of `/media/*` (immutable cache headers and Range support are built in). Alternatively set `STORAGE_DRIVER=cloudinary` for public images and videos; receipts and verification documents always stay in private storage.
7. **First admin:** `ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run db:seed`, then configure the Whish recipient, commission settings and policies in Admin → Settings.
8. **Monitoring:** forward stdout/stderr to your log platform and add your error tracker (e.g. Sentry) in `src/app/error.tsx` and `src/server/http.ts#errorResponse`. Rate limiting is in-memory per instance; add edge or Redis rate limiting when scaling horizontally.
9. **Email (optional):** set `SMTP_URL` and install `nodemailer` to send billing emails. In-app dashboard notifications always work.
10. **Maps (optional):** `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (HTTP-referrer restricted) enables the embedded Maps preview at checkout. Without it, a keyless embed and pasted Maps links are used.

## Project layout

```
prisma/            schema, migrations, seed
src/lib/           pure, tested logic (money, phone, customization, WhatsApp message, CSV import, image matching, ranking, hours)
src/server/        server-only services (auth, orders, commission, billing, media, storage, feed, search, reviews, jobs)
src/actions/       server actions for dashboards (authorized + audited)
src/app/(customer) mobile customer app (reels, explore, restaurants, item, cart, checkout, saved)
src/app/dashboard  restaurant dashboard
src/app/admin      admin panel
src/app/api        public JSON API, uploads, media, invoices, exports, cron
tests/  e2e/       vitest suites, Playwright journeys
```

## Notes and limitations

- **Arabic:** the UI language is English. Menu content can be entered in Arabic (UTF-8 throughout, RTL-ready CSS). Invoice PDFs use standard fonts, so Arabic names show as `?`. Embed an Arabic font for production PDFs.
- **HEIC:** conversion depends on the server's libvips build. iOS normally uploads JPEG from the browser picker.
- **Streaming:** reels use optimized progressive MP4 with faststart, poster frames and conservative preloading. Adaptive HLS can be added via Cloudinary streaming profiles.
- **Image matching:** "intelligent" matching is filename/name-similarity based, and suggestions always need restaurant confirmation. No external AI service is called.
