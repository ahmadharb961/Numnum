# Putting numnum online (Hostinger, same setup as Hireel)

numnum uses exactly the same services as Hireel:

| | What for | Cost |
|---|---|---|
| **Hostinger Cloud Startup** | Runs the website + email | Already paid (same plan as Hireel) |
| **Neon** | Database (also stores the menu photos) | Free to start; ~$19/month when you grow |
| **Cloudflare Stream** | Food reels (uploading, streaming, thumbnails) | Same account as Hireel; ~$5 per 1,000 minutes stored + $1 per 1,000 minutes watched |
| **GitHub** | Saves the code | Free |

Passwords, API tokens and secrets go **only** into Hostinger's environment-variable screen, never into chat, email or code.

---

## Part 1: The domain: 10 minutes + waiting time

1. Buy the domain (e.g. `numnum.app`) wherever you bought Hireel's.
2. hPanel → **Websites** → **Add website** → add the domain to your **Cloud Startup** plan. hPanel shows **two nameservers**.
3. At your domain registrar, set the domain's nameservers to the two that hPanel shows.
4. Wait until hPanel shows the domain as connected (30 minutes to 24 hours).
5. hPanel → **Security → SSL** → turn on the free SSL for the domain.

## Part 2: The database (Neon): 5 minutes

1. **neon.tech** → **New project**. Name: `numnum`. Region: **Europe (Frankfurt)**.
   (Use a new project, separate from Hireel's.)
2. Click **Connect**. **Turn off "Connection pooling"**, then copy the connection string (it starts with `postgresql://` and ends with `sslmode=require`).
3. Keep it for Part 5.

## Part 3: Email (Hostinger mailbox): 5 minutes

1. hPanel → **Emails** → your numnum domain → **Create email account** → `no-reply@yourdomain.com`.
2. Settings for Part 5: host `smtp.hostinger.com`, port `465`, user `no-reply@yourdomain.com`, and the password you chose.

## Part 4: Video (Cloudflare Stream): 2 minutes

You already have Stream from Hireel. Reuse the same **Account ID** and the same **API token** (permission "Stream: Edit"), or create a second token named `numnum Stream` the same way. Nothing else to set up: numnum finds the customer code by itself.

## Part 5: Put numnum on Hostinger: 15 minutes

1. hPanel → **Websites** → your numnum domain → **Node.js** → **Import Git repository**.
2. Repository: `ahmadharb961/Numnum`. Branch: the one with the latest code (merge `claude/festive-knuth-auk8oi` into `main` first, or pick it directly).
3. Settings:
   - Node version: **22**
   - Install command: `npm install`
   - Build command: `npm run build`
   - Start command: `npm start`
4. **Environment variables** (names exactly as below):

| Name | Value |
|---|---|
| `DATABASE_URL` | Neon connection string from Part 2 |
| `APP_URL` | `https://yourdomain.com` (no slash at the end) |
| `SESSION_SECRET` | long random password, 40+ characters |
| `CRON_SECRET` | another long random password |
| `ADMIN_EMAIL` | your admin login email |
| `ADMIN_PASSWORD` | your admin password (12+ characters) |
| `CLOUDFLARE_ACCOUNT_ID` | from Part 4 |
| `CLOUDFLARE_STREAM_API_TOKEN` | from Part 4 |
| `SMTP_HOST` | `smtp.hostinger.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `no-reply@yourdomain.com` |
| `SMTP_PASS` | mailbox password from Part 3 |
| `MAIL_FROM` | `numnum <no-reply@yourdomain.com>` |
| `SEED_DEMO` | `true` only if you want the 6 demo restaurants (to show investors or restaurants); otherwise leave it out |

5. Click **Deploy**. Every deploy automatically updates the database, creates the food categories, and creates your admin account the first time. Redeploying never deletes data.

## Part 6: Hourly billing job: 3 minutes

It issues the monthly invoices on the 1st, sends payment reminders and finishes video processing.

1. hPanel → **Advanced** → **Cron Jobs** → **Create**.
2. Run it **every hour** (e.g. minute `7`).
3. Command (replace the two values):

```bash
curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" https://yourdomain.com/api/cron
```

## Part 7: First-time setup in the site: 5 minutes

1. Open `https://yourdomain.com/login` and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
2. **Admin → Settings → Whish Money / Whish Pay recipient**: enter the name, Whish number and instructions restaurants will pay to.
3. Check **Commission** (14%, charged when a restaurant acknowledges an order) and **Invoicing** (due days, reminders).
4. Restaurants sign up at `https://yourdomain.com/business`. Approve them in **Admin → Restaurants**.

## Part 8: Test on real phones

1. **iPhone (Safari) and Android (Chrome):** open the site. Add it to the home screen (Share → Add to Home Screen on iPhone; the Install prompt on Android).
2. As a restaurant (or a demo owner, e.g. `owner@burgerhouse.demo` / `demo1234` if you used `SEED_DEMO`): import a menu, upload photos, and record a reel with the phone camera. The reel shows "Processing" for about a minute, then goes live.
3. As a customer: watch the reel, order the dish, and check that WhatsApp opens with the full order.
4. Back in the restaurant dashboard: **Order requests** → enter the order reference → **Acknowledge**.

### Notes

- Demo restaurants have no reels on Hostinger, because demo videos are generated with ffmpeg, which Hostinger doesn't have. Upload a few real food videos from the dashboard.
- To remove demo data later, use a fresh Neon database (or ask me for a cleanup script).
- Photos are stored in Neon. Roughly 150 real menu photos take about 15–20 MB (they are resized to 1200 px WebP), so the free tier covers the first restaurants. Neon's paid plan is needed when you reach a few hundred restaurants.
