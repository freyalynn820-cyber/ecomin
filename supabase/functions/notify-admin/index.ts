// ============================================================
// Core Hash · Admin-notification Edge Function
//
// Receives a JSON payload from Postgres triggers (via pg_net) and
// sends an email to ADMIN_EMAIL through Gmail SMTP.
//
// Deploy:
//   supabase functions deploy notify-admin --no-verify-jwt
//
// Required secrets (set with `supabase secrets set …`):
//   SMTP_USER           Gmail address used to send         e.g. fryalynn820@gmail.com
//   SMTP_PASS           Gmail App Password (16 chars)
//   ADMIN_EMAIL         Where notifications are sent       e.g. fryalynn820@gmail.com
//   WEBHOOK_SECRET      Shared secret matching db/notifications.sql
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const SMTP_USER      = Deno.env.get("SMTP_USER")      ?? "";
const SMTP_PASS      = Deno.env.get("SMTP_PASS")      ?? "";
const ADMIN_EMAIL    = Deno.env.get("ADMIN_EMAIL")    ?? "";
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function htmlEnvelope(title: string, lines: string[]) {
  const safeLines = lines
    .map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))
    .join("<br>");
  return `<!doctype html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0b2d4f;line-height:1.5;max-width:600px;margin:0 auto;padding:24px">
  <div style="border-left:4px solid #1256E3;padding:6px 14px;margin-bottom:18px">
    <strong style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#6b7a8e">Core Hash · Admin notification</strong>
    <h2 style="margin:4px 0 0;font-size:18px">${title}</h2>
  </div>
  <div style="font-size:14px">${safeLines}</div>
  <hr style="border:none;border-top:1px solid #e5ebf2;margin:24px 0">
  <p style="font-size:12px;color:#6b7a8e">Sent automatically by Core Hash. Sign in at <a href="https://corehash.cc/admin/" style="color:#1256E3">corehash.cc/admin</a>.</p>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return json({ error: "method not allowed" }, 405);

  // Shared-secret auth — the trigger sends this in Authorization
  const auth = req.headers.get("authorization") || "";
  if (!WEBHOOK_SECRET || auth !== `Bearer ${WEBHOOK_SECRET}`) {
    return json({ error: "unauthorized" }, 401);
  }

  if (!SMTP_USER || !SMTP_PASS || !ADMIN_EMAIL) {
    return json({ error: "smtp not configured (set SMTP_USER / SMTP_PASS / ADMIN_EMAIL secrets)" }, 500);
  }

  let payload: { event?: string; subject?: string; lines?: string[]; details?: Record<string, unknown> } = {};
  try { payload = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  const event   = payload.event   ?? "event";
  const subject = payload.subject ?? `[Core Hash] ${event}`;
  const lines   = Array.isArray(payload.lines) ? payload.lines : [];

  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: SMTP_USER, password: SMTP_PASS },
    },
  });

  try {
    await client.send({
      from:    `Core Hash <${SMTP_USER}>`,
      to:      ADMIN_EMAIL,
      subject: subject,
      content: lines.join("\n"),
      html:    htmlEnvelope(subject.replace(/^\[Core Hash\]\s*/, ""), lines),
    });
  } catch (e) {
    return json({ error: "smtp send failed", detail: String(e) }, 500);
  } finally {
    try { await client.close(); } catch { /* ignore */ }
  }

  return json({ ok: true, event });
});
