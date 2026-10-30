# numnum

Video-first food discovery and delivery ordering for Lebanon — a mobile-first web app (installable PWA), not a native app. Payment is **cash on delivery** only.

**Customer flow:** browse reels and menus freely → open the dish → customize → add to cart → log in (required to order) → delivery or pickup → pick a saved address or pin a new one on the map → distance-based delivery fee → cash on delivery → place order → live tracking → rating popup after delivery. Accounts add order history, saved addresses, saved items and reorder.

**Restaurant flow:** register → add the dashboard to the phone's home screen and allow notifications (required on phones) → pin the restaurant and set delivery zones by distance → import menu (CSV) → upload photos (ZIP / bulk, matched by SKU) → upload reels linked to dishes → receive orders with a sound alert → accept with an ETA → preparing → out for delivery / ready → completed (cash collected) → review the monthly commission invoice → pay via Whish → upload proof.

**Admin:** restaurant approval and verification, moderation, commission ledger, monthly invoicing, Whish payment reconciliation, disputes, adjustments, global settings, audit log.

---

## Stack

| Layer | Choice |
| --- | --- |
| Web | Next.js 15 (App Router, Server Components, Server Actions), React 19, TypeScript, Tailwind CSS |
| Data | PostgreSQL + Prisma (migrations in `prisma/migrations`) |
| Auth | Session cookies (httpOnly, hashed tokens in DB), bcrypt, role-based access (customer / restaurant staff: owner, manager, staff / admin) |
| Media | `sharp` image pipeline (EXIF rotate, metadata strip, resize without distortion, WebP + thumbnails), stored in Postgres. Videos on Cloudflare Stream (tus uploads, adaptive HLS via hls.js); local `ffmpeg` fallback for development |
| Jobs | DB-backed job queue (`jobs` table) for video processing; scheduled endpoint for billing |
| Documents | `pdf-lib` invoice PDFs, CSV statements/exports |

## Key business rules (where they live)

| Rule | Implementation |
| --- | --- |
| Prices never trusted from the browser | `src/server/orders.ts` → `priceCart()` re-prices from DB and re-validates customizations (`src/lib/customization.ts`, shared with the UI) |
| Immutable financial snapshots | `orders`, `order_items`, `order_item_customizations` store names/prices at order time; commission events store base, rate and amount |
| Money is integer minor units | `src/lib/money.ts` (`calcCommission` = base × bps / 10000, half-up to the cent). LBP menus use an explicit admin-set exchange rate stored on each order |
| Delivery range | Restaurants pin their location and define zones by straight-line distance (`src/lib/geo.ts`: up to N km → fee). Customers' delivery addresses must be pinned (GPS or draggable OpenStreetMap pin); orders beyond the last zone are refused server-side. Restaurant pages, lists and the feed show distance and "delivers to you" from the chosen location (`nn_loc` cookie) |
| Reel analytics | Per reel and date range: views, unique viewers, avg. watch time, likes, shares, dish opens, add-to-cart, orders and completed revenue attributed to the reel (`reelsPerformance` / `reelInsight` in `src/server/insights.ts`); shown on each reel page and compared on Insights + PDF |
| Order notifications | Web Push (VAPID keys auto-created in the DB, `src/server/push.ts`); on phones the dashboard requires the home-screen app + notifications (`install-gate.tsx`), plus an in-page sound alert |
| Order lifecycle | `PLACED` → `ACCEPTED` (ETA) → `PREPARING` → `OUT_FOR_DELIVERY` / `READY_FOR_PICKUP` → `COMPLETED`; exits `REJECTED` (restaurant, with reason), `CANCELED` (customer before acceptance, or admin), `FAILED` (not delivered). See `src/server/orders.ts` |
| Billable event (default: completed orders) | `src/server/commission.ts` → `ensureCommission()`; Admin → Settings can switch to accepted orders. Accepted orders left open are auto-completed after N hours (`autoCompleteStaleOrders`, run by `/api/cron`) |
| Exactly one commission per order | Unique index on `commission_events.orderId` + `INSERT … ON CONFLICT DO NOTHING`; orders use an idempotency key, so repeated taps or refreshes return the same order |
| Monthly invoices, never silently edited | `src/server/billing.ts` → `generateInvoice()` (unique per restaurant + period, sequential numbers). Corrections are adjustment/credit lines |
| Payment is "submitted", never auto-"paid" | `submitPayment()` → `PAYMENT_SUBMITTED`; only `reviewPayment()` by an admin adds verified money |
| Tenant isolation | Every restaurant query is scoped by the session's restaurant; receipts/documents are served only through `/api/private-media/[id]` with ownership checks |
| No deletion on CSV re-import | `commitImport()` updates by SKU, preserves photos/reels/reviews/customizations; archiving missing items is a separate confirmed step |

## Local development

Requirements: Node 20+, PostgreSQL 14+, `ffmpeg` and `ffprobe` on the PATH.

```bash
cp .env.example .env          # set DATABASE_URL, SESSION_SECRET (Cloudflare optional locally)
npm install
npx prisma migrate deploy
SEED_DEMO=true npm run db:seed   # demo data; omit SEED_DEMO for categories + admin only
npm run dev
```

The demo seed loads pre-rendered photos and reels from `prisma/demo/` (regenerate with `npm run demo:media` after editing `prisma/demo-data.ts`; uploaded to Cloudflare Stream when configured), runs real orders through the order/commission/billing services, and issues an invoice with a pending Whish payment.

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

Covered: commission math (a $20 order → $2.80 at 14%, delivery fee excluded), exactly-once commission under concurrent completions, no commission on rejected/canceled/failed orders, auto-completion, billing on acceptance with rate snapshots, delivery fees by area, closed/paused restaurants, change-for validation, saved addresses (and refusing another user's address), guest tracking by device/token and claiming guest orders on sign-in, cancellation rules, tenant isolation, idempotent order submission, client-price tampering, monthly invoicing, Whish approval and partial payments, dispute credits, Cloudflare Stream status sync, images stored in Postgres, CSV validation (Arabic/UTF-8), SKU photo matching, feed diversity.

The E2E scripts cover: guest order from a reel to cash-on-delivery checkout and live tracking; the restaurant accepting, dispatching and completing it while the customer page updates; guest cancellation; sign-up claiming guest orders; a logged-in checkout with a saved address; a 150-item CSV import and re-import; a 150-photo ZIP upload; admin payment verification; tenant isolation; and an error sweep of every dashboard and admin page.

## Putting it online (Hostinger)

Follow **[docs/SETUP.md](docs/SETUP.md)**. It's the same setup as Hireel: Hostinger Cloud Startup (Node 22), Neon Postgres, Cloudflare Stream for reels, the Hostinger mailbox for email, and an hPanel cron job calling `/api/cron` hourly.

- `npm run build` is the Hostinger build. It applies database migrations, creates the categories and the first admin (`ADMIN_EMAIL`/`ADMIN_PASSWORD`), optionally loads demo data (`SEED_DEMO=true`), then builds with limited threads.
- Photos, receipts and documents are stored in Postgres. Nothing needs a persistent disk.
- Reels upload from the phone straight to Cloudflare Stream (resumable tus uploads) and play as adaptive HLS. Processing status is synced when restaurants view their reels and by the hourly cron, so no webhook setup is needed.
- Without Cloudflare credentials (local development), reels fall back to local ffmpeg transcoding.

`npm run build:local` builds without touching a database (CI, Docker). A `Dockerfile` is included for VPS hosting.

## Project layout

```
prisma/            schema, migrations, seed
src/lib/           pure, tested logic (money, phone, customization, order statuses, CSV import, image matching, ranking, hours)
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
- **Streaming:** with Cloudflare Stream, reels play as adaptive HLS (lower quality on weak mobile networks), and only the visible and next reel buffer. The local ffmpeg fallback produces a progressive 720p MP4.
- **Image matching:** "intelligent" matching is filename/name-similarity based, and suggestions always need restaurant confirmation. No external AI service is called.
