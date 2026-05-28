// Supabase project credentials.
//
// 1. Create a project at https://supabase.com
// 2. Settings → API → copy "Project URL" and "Project API keys → anon / public"
// 3. Paste them below and redeploy.
//
// The anon key is safe to expose to the browser — it only grants the access
// you've allowed via Row Level Security policies. Do NOT paste the
// service_role key here.

window.SUPABASE_URL = 'https://ilfwdubnowjtjdakuswb.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZndkdWJub3dqdGpkYWt1c3diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4ODU0NjUsImV4cCI6MjA5MjQ2MTQ2NX0.NCt_-IIzAkvOM7QQ3NPvOdIRKmeQmpcT4LSr9toQYD8';

// Single entry point: returns a configured Supabase client, or null + alert
// if the credentials above haven't been set yet.
window.getSupabase = function () {
  if (
    !window.SUPABASE_URL ||
    !window.SUPABASE_ANON_KEY ||
    window.SUPABASE_URL.startsWith('YOUR_') ||
    window.SUPABASE_ANON_KEY.startsWith('YOUR_')
  ) {
    document.body.innerHTML =
      '<div style="font-family:system-ui;padding:40px;max-width:560px;margin:60px auto;border:1px solid #e5ebf2;border-radius:14px;color:#0b2d4f">' +
      '<h2 style="margin:0 0 12px">Supabase not configured</h2>' +
      '<p style="color:#6b7a8e;line-height:1.5">Open <code>config.js</code> and set <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> to your project values, then reload.</p>' +
      '</div>';
    return null;
  }
  if (!window.supabase || !window.supabase.createClient) {
    console.error('Supabase JS library failed to load.');
    return null;
  }
  return window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
};
