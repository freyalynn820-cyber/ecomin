# Core Hash — Site Overview

Plain-English explainer of how the whole site fits together: what it does, what's real, what's still demo, and how to operate it as an admin.

---

## 1. What it is

**Core Hash** (corehash.cc) is a Bitcoin-mining marketplace. People sign up, deposit crypto, then either buy cloud-mining contracts, buy ASIC mining rigs, or rent hosted rigs. Admins receive those requests, talk to the user offline (for now) to settle payment, and mark them fulfilled. Earnings sit as a BTC balance in the user's account; the user can request withdrawals back to their own wallet.

The site is **fully static HTML/CSS/JS** in the browser. All "backend" lives in **Supabase** (Postgres + Auth + RLS). There is no Node server — Netlify just serves the files.

---

## 2. The two surfaces

### Public marketing site
- **[index.html](../index.html)** — landing page with hero, hardware grid, hosting pricing, FAQ, footer.
- Nav has **Sign in** → login; **Start mining** → register.
- Most footer links are decorative (`href="#"`) because there's no legal / blog content yet.

### Signed-in app
Anyone logged in sees these. Pages all share the same dark sidebar.

| Page | What it does |
|---|---|
| [dashboard.html](../dashboard.html) | Home. Greets the user, shows balance card with **Deposit** and **Withdraw** buttons. Most stat cards are still placeholders. |
| [account/deposit.html](../account/deposit.html) | Pick crypto (BTC / USDT-TRC20 / USDT-ERC20 / ETH), see the wallet address an admin configured, paste your tx hash. **Real.** |
| [account/withdrawals.html](../account/withdrawals.html) | Submit a BTC withdrawal to your own wallet. Shows your withdrawal history + status. **Real.** |
| [account/transactions.html](../account/transactions.html) | Combined view: every deposit and withdrawal you've made, with status. **Real.** |
| [account/settings.html](../account/settings.html) | Profile + 2FA settings. Most controls are still demo. |
| [account/referrals.html](../account/referrals.html) | Referral mockup. Not wired. |
| [account/rewards.html](../account/rewards.html) | Loyalty tier mockup. Not wired. |
| [store/buy-cloud.html](../store/buy-cloud.html) | Browse cloud-mining contracts. Click **Buy** → creates a pending order. **Real.** |
| [store/buy-asics.html](../store/buy-asics.html) | Browse ASIC rigs. Click **Buy** → pending order. **Real.** |
| [store/rent-asics.html](../store/rent-asics.html) | Browse rentable rigs at hosting sites. Click **Rent** → pending order. **Real.** |
| [store/promo.html](../store/promo.html) | Promo landing inside the store. Static. |
| [marketplace/*.html](../marketplace/) | Hashrate / ASIC / Offers marketplaces. Listings are hardcoded; buy & sell buttons are not wired. |

### Admin area
At `/admin/`. Hidden unless your account has the admin role.

| Section | What it does |
|---|---|
| **Overview** | KPI cards + activity feed. Mostly mock. |
| **Users** | Live list of every signup. Edit display name, ban / unban. **Real.** |
| **Deposits** | Approve or reject submitted deposits. Approving auto-credits the user's BTC balance. **Real.** |
| **Withdrawals** | Approve withdrawals (debits balance automatically) or reject with a reason. **Real.** |
| **Orders** | Store orders (cloud / buy ASIC / rent ASIC). Mark fulfilled or cancelled. **Real.** |
| **Wallets** | The deposit addresses users see. Add, disable, delete. **Real.** |
| **Cloud / Buy ASICs / Rent ASICs / Hashrate / ASIC market** | Catalog management UIs — not wired yet. Catalog still lives in JS arrays. |
| **Transactions** | Demo data — superseded by the per-user transaction views. |
| **Settings** | Site-wide preferences, mostly demo. |

---

## 3. How data flows (the simple version)

```
              ┌──────────────────────────────┐
              │           Browser            │
              │  (any page on corehash.cc)   │
              └──────────────┬───────────────┘
                             │ supabase-js
                             ▼
              ┌──────────────────────────────┐
              │          Supabase            │
              │  Auth · Postgres · RLS       │
              └──────────────────────────────┘
```

Every page that needs data does so directly from the browser via `supabase-js` against the same project. There is **no server in between**. The database protects itself with **Row-Level Security (RLS)** policies — a user can only see/modify rows they own; admins (`app_metadata.role = 'admin'` in the JWT) can see/modify everything.

That's why exposing the `SUPABASE_URL` and `anon` key in [config.js](../config.js) is safe: those keys only let the browser talk to the API; what it can actually do is decided by RLS rules in the database.

---

## 4. Auth (signup → first sign-in)

1. User visits **/register**, fills name + email + password.
2. `supabase-js` creates the user in `auth.users` and emails a confirmation link.
3. A Postgres trigger (`handle_new_user`) inserts a matching row into `public.profiles` so we have a place to attach `balance_btc`, role, status, etc.
4. User clicks the email link → lands on `/dashboard.html` already signed in.
5. Sign-in just looks up email+password against `auth.users` and stores a JWT in the browser. Every page checks for that JWT on load and redirects to `/login` if missing.
6. **Google / GitHub SSO** buttons work the same way (one-click OAuth round-trip).
7. **Forgot password** → enter email on `/login` → Supabase emails a reset link → land on `/reset-password.html` → choose a new password.

### How admin promotion works
There is no self-serve admin signup. To make someone an admin, paste this in Supabase → SQL Editor with their email:

```sql
update auth.users
set raw_app_meta_data = jsonb_set(coalesce(raw_app_meta_data,'{}'::jsonb), '{role}', '"admin"')
where email = 'you@example.com';
```

Then **sign out and back in** so the new JWT carries the admin claim.

---

## 5. The money flow

There's one number per user that everything else credits or debits: **`profiles.balance_btc`**.

### Depositing (adds BTC)
1. Admin adds a wallet address per asset (BTC / USDT-TRC20 / USDT-ERC20 / ETH) under **Admin → Wallets**.
2. User goes to **Account → Deposit**, picks an asset, sees the address + QR.
3. User sends crypto from their own wallet, then enters the tx hash on the form.
4. A new row lands in `deposits` with status `pending`.
5. Admin opens **Admin → Deposits**, verifies the transaction on a block explorer, clicks **Approve**, and types the BTC amount to credit (admin's call — they can apply any rate / fee they want).
6. A Postgres trigger atomically:
   - Adds that BTC amount to `profiles.balance_btc`.
   - Stamps `confirmed_at` and `confirmed_by`.
   - Flips status to `confirmed`.
7. User refreshes → balance is higher.

### Withdrawing (removes BTC)
1. User goes to **Account → Withdrawals**, types the BTC amount and a destination address, hits Withdraw.
2. A `withdrawals` row is created with status `pending`. **No money moves yet.**
3. Admin opens **Admin → Withdrawals**, sends the actual BTC on-chain from a treasury wallet, clicks **Approve**, optionally pastes the tx hash.
4. The same kind of trigger fires:
   - Subtracts the amount from `profiles.balance_btc` (refuses if the user doesn't have enough).
   - Stamps `processed_at` / `processed_by`.
   - Flips status to `approved`.

### Buying / renting (order → on-chain payment → fulfillment)
1. User clicks **Buy** or **Rent** on a store page. A confirm dialog summarises the price.
2. A row goes into `orders` with status `pending`, capturing what they picked (cloud contract / ASIC model / hosted rental + site).
3. The user is redirected to **/account/deposit.html?order=&lt;id&gt;**. The page recognises the order, shows a "Paying for: X · $Y" banner above the form, and the user picks a crypto, sees the wallet address, sends, and pastes the tx hash.
4. The deposit row is linked to the order via `deposits.order_id`. Both rows are now in admin's queue, visibly tied together.
5. Admin opens **Admin → Deposits** → sees the row with a "for order: X · $Y" tag → verifies on chain → **Approve** (enters BTC amount to credit, which optionally tops up the user's balance).
6. Admin opens **Admin → Orders** → **Fulfill** the linked order once they're satisfied the payment is settled. (Or **Cancel** with a reason — the deposit stays as-is, admin can refund offline.)

> **Note:** there's still no automatic payment processor — admin verifies each transaction on a block explorer. But the user no longer needs to be contacted by email to know what to pay; the flow is fully self-service up to the verification step.

---

## 6. Database in one screen

Six application tables, all under the `public` schema. Each one has RLS enabled.

| Table | Owner | What it stores |
|---|---|---|
| `profiles` | one per `auth.users` | Display name, role (`user`/`admin`), status, **`balance_btc`** |
| `wallet_addresses` | admin only | The deposit addresses shown to users |
| `deposits` | user creates, admin updates | Each crypto deposit submission |
| `withdrawals` | user creates, admin updates | Each cashout request |
| `orders` | user creates, admin updates | Each store purchase intent |

Triggers do the load-bearing work:
- `handle_new_user` — copy `auth.users` into `profiles` on signup.
- `credit_on_deposit_confirm` — bump balance when a deposit is approved.
- `debit_on_withdrawal_approve` — debit balance when a withdrawal is approved (refuses if insufficient).
- `stamp_order_fulfilled` — stamp `fulfilled_at` / `fulfilled_by` when an order is fulfilled.

Schema files are checked in:
- [db/setup.sql](../db/setup.sql) — profiles + trigger + RLS.
- [db/deposits.sql](../db/deposits.sql) — wallet_addresses + deposits.
- [db/orders-withdrawals.sql](../db/orders-withdrawals.sql) — withdrawals + orders.

To install on a fresh Supabase project, paste each file in order into the SQL Editor and Run.

---

## 7. Deployment

```
GitHub  ──push──▶  Netlify  ──serves──▶  corehash.cc
                       │
                       │ DNS / SSL via Cloudflare
                       ▼
                  https://corehash.cc
```

- **Repo:** [freyalynn820-cyber/ecomin](https://github.com/freyalynn820-cyber/ecomin) — push to `main` triggers a Netlify build.
- **Netlify config:** [netlify.toml](../netlify.toml) — sets security headers, no-store on `config.js`, and a 301 from the legacy `*.netlify.app` URL to `corehash.cc`.
- **Domain:** corehash.cc (clean reputation), with `www` redirected to apex.
- **TLS:** auto from Netlify.
- **Anti-flag:** the original `velvety-salmiakki-*.netlify.app` URL was flagged by Chrome Safe Browsing because of the combination of crypto content + brand-new netlify.app subdomain. The custom domain solves that.

---

## 8. Tech stack at a glance

| Layer | Tech |
|---|---|
| Hosting | Netlify (static) |
| DNS / SSL | Cloudflare + Netlify managed certs |
| Source | GitHub |
| Frontend | Plain HTML + CSS + vanilla JS (no framework, no build step) |
| Auth | Supabase Auth (email + Google + GitHub) |
| Database | Supabase Postgres |
| Authorization | Postgres Row-Level Security + JWT `app_metadata.role` |
| Email | Default Supabase sender (rate-limited — swap to Resend / Postmark for production) |
| Crypto on-ramp | Manual: admin posts addresses, user pastes tx hash, admin approves |
| Payments | None yet — orders are recorded; admin handles settlement off-app |

---

## 9. Day-in-the-life of an admin

A typical session:

1. Open **/admin/** (sign in if needed).
2. Check the **Deposits** badge — that's how many pending deposits are waiting. Click in, verify each on chain, click **Approve** and type the BTC to credit (or reject with a reason).
3. Check the **Withdrawals** badge. Send the actual on-chain transfer from the treasury wallet first, then click **Approve** in the admin and optionally paste the tx hash. The trigger debits the user automatically.
4. Check the **Orders** badge. Email the user about payment + shipping/hosting. Click **Fulfill** when done, or **Cancel** with a reason.
5. Visit **Wallets** to add a new deposit address, disable a compromised one, or rotate.
6. Visit **Users** to ban a bad actor, fix a typo in someone's name, or check signups.

---

## 10. Adding a new module — the recipe

Each "real" module on this site follows the same shape. Copy it.

1. **Write the SQL.** Put it in `db/<module>.sql`. Include:
   - The table(s) + indexes.
   - `alter table … enable row level security;` and policies for users vs. admins.
   - Any triggers (especially for atomic balance changes).
2. **Build the user page.** Mirror [account/deposit.html](../account/deposit.html):
   - Same sidebar template.
   - Top with `<script src="../store/auth.js">` to gate on session.
   - Form → `sb.from('your_table').insert(...)` with RLS allowing only `auth.uid()` inserts.
   - Bottom: list the user's own rows.
3. **Build the admin section.** Mirror the Deposits section inside [admin/index.html](../admin/index.html):
   - Add a `<button data-section="…">` to the side nav.
   - Add a `<section class="section" data-section="…">` block.
   - Add an entry to the `titles` map.
   - Add a `loadX()` + filter chips + approve/reject row handlers.
4. **Push.** Netlify auto-rebuilds. Run the new SQL once in Supabase. Done.

---

## 11. What's still on the to-do list

In honesty order:

| Area | Status |
|---|---|
| Payment integration for orders (Stripe / crypto-payment processor) | Not built |
| Custom SMTP (real email-from address, no rate limit) | Not configured — Supabase default is testing-only |
| Real legal pages (Terms / Privacy / Risk disclosure) | Stubs |
| Marketplaces (hashrate, ASIC peer-to-peer) | UI-only |
| Referrals + Rewards | UI-only |
| Real catalog management in admin | UI-only — catalog lives in JS arrays in store pages |
| Dashboard live numbers (hashrate, mining power, payouts feed) | Hardcoded UI |
| Search Console verification + ESG report content | Not yet |

These are intentionally deferred — each is its own deliverable.
