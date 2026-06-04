# Notifications + Live Chat — setup

End-to-end checklist to wire up email notifications (signup, deposit, withdrawal, order, chat message) and the live chat module. Estimated time: 20–30 minutes.

---

## 0 · Replace the Gmail app password

The one shared in chat is compromised. Go to https://myaccount.google.com/apppasswords, **revoke** `fmpinjiyfrmqptdn`, then **generate a fresh 16-character app password** for "Mail". Keep it safe — you'll paste it into Supabase only.

---

## 1 · Configure Supabase Auth SMTP (auth emails — signup confirmation, password reset)

This makes Supabase send its built-in auth emails through your Gmail instead of the rate-limited default.

1. Supabase dashboard → **Project Settings → Authentication → SMTP Settings**.
2. Toggle **Enable Custom SMTP** on.
3. Fill in:
   - **Sender email**: `fryalynn820@gmail.com`
   - **Sender name**: `Core Hash`
   - **Host**: `smtp.gmail.com`
   - **Port**: `465`
   - **Username**: `fryalynn820@gmail.com`
   - **Password**: *the fresh app password from step 0*
   - **Minimum interval**: 60s (default is fine)
4. Click **Save**.
5. Send yourself a test by triggering a real flow — e.g. open `/login` and click **Forgot?**.

> If email confirmation is still ON (`Authentication → Providers → Email → Confirm email`), signup emails will now come from `fryalynn820@gmail.com`. If it's OFF, only password-reset emails use SMTP.

---

## 2 · Run the chat + notification SQL

In Supabase → **SQL Editor → New query**:

1. Paste [db/chat.sql](../db/chat.sql) → **Run**.
2. Verify:
   ```sql
   select count(*) from public.chat_messages;          -- 0
   select 1 from pg_publication_tables                  -- 1 row
     where pubname='supabase_realtime'
       and tablename='chat_messages';
   ```
3. Test the user chat:
   - Visit any signed-in user page (e.g. `/dashboard`).
   - The floating bubble bottom-right opens a chat panel.
   - Type a message, send.
   - As admin, go to `/admin/` → **Chat** → see the new thread with an unread badge.

---

## 3 · Enable pg_net (one-click)

Supabase dashboard → **Database → Extensions** → search **pg_net** → **Enable**.

This is what lets Postgres trigger functions make outbound HTTP calls to the Edge Function.

---

## 4 · Deploy the Edge Function

You need the Supabase CLI: https://supabase.com/docs/guides/cli (Homebrew: `brew install supabase/tap/supabase`).

```bash
# Link the local project to your Supabase project
supabase link --project-ref YOUR-PROJECT-REF

# Deploy the function (the --no-verify-jwt flag lets it accept calls
# authed by our own WEBHOOK_SECRET instead of a JWT)
supabase functions deploy notify-admin --no-verify-jwt
```

Set the function secrets — these only live in Supabase, never in the repo:

```bash
supabase secrets set \
  SMTP_USER=fryalynn820@gmail.com \
  SMTP_PASS=<your fresh 16-char Gmail app password> \
  ADMIN_EMAIL=fryalynn820@gmail.com \
  WEBHOOK_SECRET=<a long random string you invent, e.g. `openssl rand -hex 32`>
```

Quick test (replace `<...>`):

```bash
curl -X POST \
  https://YOUR-PROJECT-REF.supabase.co/functions/v1/notify-admin \
  -H "Authorization: Bearer <WEBHOOK_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"event":"test","subject":"[Core Hash] Test","lines":["This is a test."]}'
```

You should get `{"ok":true,"event":"test"}` back and an email in your inbox.

---

## 5 · Wire up the Postgres triggers

1. Open [db/notifications.sql](../db/notifications.sql) and **edit lines 24–25** before running:
   - Replace `YOUR-PROJECT-REF` with your actual Supabase project ref.
   - Replace `CHANGE-ME-TO-A-LONG-RANDOM-STRING` with the **same** `WEBHOOK_SECRET` you set on the function.
2. Supabase → **SQL Editor → New query** → paste the edited file → **Run**.
3. Verify the GUC values were saved:
   ```sql
   show "app.notify_function_url";
   show "app.notify_webhook_secret";
   ```

> If `ALTER DATABASE` errors with "permission denied", scroll to the very top of `notifications.sql` for the fallback (embed the values directly into the `notify_admin()` function body).

---

## 6 · End-to-end test

1. Sign up a new test user → admin email arrives within a few seconds with subject `[Core Hash] New user signup`.
2. As the test user, submit a fake deposit → another email.
3. Open the chat widget, type "hello" → another email.
4. From admin Chat → reply "hi" → in the user's browser the reply appears in real time without refresh.

---

## What's wired vs. not

| Event | Trigger | Email goes to |
|---|---|---|
| New signup | `auth.users` INSERT | `ADMIN_EMAIL` |
| New deposit submission | `public.deposits` INSERT | `ADMIN_EMAIL` |
| New withdrawal request | `public.withdrawals` INSERT | `ADMIN_EMAIL` |
| New store order | `public.orders` INSERT | `ADMIN_EMAIL` |
| New chat message (user side only) | `public.chat_messages` INSERT | `ADMIN_EMAIL` |
| Auth confirmation / password reset | Supabase Auth | the user |

User-facing notifications (e.g. "your deposit was approved") are not wired yet. Easy to add later by emitting from triggers on UPDATE in the same pattern.

---

## Troubleshooting

- **"smtp send failed: Username and Password not accepted"** → the app password you pasted is wrong or has been revoked. Generate a new one and re-run `supabase secrets set SMTP_PASS=…`.
- **Triggers run but no email arrives** → check Supabase **Functions → notify-admin → Logs** for errors. Most often it's `unauthorized` (the `WEBHOOK_SECRET` in db/notifications.sql doesn't match the one set on the function).
- **Chat widget doesn't appear** → user isn't signed in, or `db/chat.sql` hasn't been run. Open browser devtools console for the actual error.
- **Realtime not delivering** → confirm `chat_messages` is in `supabase_realtime` publication (step 2 verify query).
