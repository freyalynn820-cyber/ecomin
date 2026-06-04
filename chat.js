// ============================================================
// Core Hash · Floating support-chat widget
// Drop-in <script src="/chat.js"></script> on any user page. Renders
// a bottom-right bubble that opens a one-on-one thread with support.
// Admin replies arrive in real time via the Supabase Realtime channel
// for public.chat_messages (filtered on user_id).
// ============================================================
(async () => {
  if (window.__chxLoaded) return;
  window.__chxLoaded = true;

  const sb = window.getSupabase ? window.getSupabase() : null;
  if (!sb) return;

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  // Note: admins also see the bubble on user pages (useful for testing).
  // The dedicated admin panel lives at /admin/ → Chat.

  // ----- inject CSS -----
  const css = `
    .chx-root { position: fixed; bottom: 18px; right: 18px; z-index: 9000;
      font-family: 'Inter Tight', system-ui, sans-serif; color: #0b2d4f; }
    .chx-bubble {
      width: 56px; height: 56px; border-radius: 50%;
      background: linear-gradient(135deg, #1256E3, #0b2d4f);
      color: #fff; border: none; cursor: pointer;
      box-shadow: 0 10px 30px -6px rgba(11,45,79,.4);
      display: flex; align-items: center; justify-content: center;
      position: relative; transition: transform .15s;
    }
    .chx-bubble:hover { transform: translateY(-2px); }
    .chx-bubble svg { width: 24px; height: 24px; }
    .chx-count {
      position: absolute; top: -4px; right: -4px;
      background: #c4453d; color: #fff;
      font-size: 11px; font-weight: 700;
      min-width: 20px; height: 20px; border-radius: 999px;
      padding: 0 6px;
      display: flex; align-items: center; justify-content: center;
      border: 2px solid #fff;
    }
    .chx-panel {
      width: 340px; max-width: calc(100vw - 36px);
      height: 480px; max-height: calc(100vh - 36px);
      background: #fff;
      border: 1px solid #e5ebf2; border-radius: 14px;
      box-shadow: 0 18px 48px -12px rgba(11,45,79,.4);
      display: flex; flex-direction: column;
      overflow: hidden;
    }
    .chx-head {
      padding: 12px 14px;
      border-bottom: 1px solid #e5ebf2;
      display: flex; align-items: center; justify-content: space-between;
      background: linear-gradient(135deg, #1256E3, #0b2d4f); color: #fff;
    }
    .chx-head strong { font-weight: 600; font-size: 14px; }
    .chx-head__sub { font-size: 11px; opacity: .8; margin-top: 1px; }
    .chx-close {
      background: rgba(255,255,255,.16); border: none; color: #fff;
      width: 26px; height: 26px; border-radius: 8px; cursor: pointer;
      font-size: 18px; line-height: 1; padding: 0;
    }
    .chx-close:hover { background: rgba(255,255,255,.28); }
    .chx-msgs {
      flex: 1; overflow-y: auto; padding: 16px;
      background: #f5f8fc;
      display: flex; flex-direction: column; gap: 10px;
    }
    .chx-empty {
      text-align: center; color: #6b7a8e; font-size: 13px;
      padding: 30px 16px; line-height: 1.5;
    }
    .chx-empty strong { display: block; font-size: 15px; color: #0b2d4f; margin-bottom: 4px; }
    .chx-msg { display: flex; flex-direction: column; max-width: 80%; }
    .chx-msg--me { align-self: flex-end; align-items: flex-end; }
    .chx-msg--admin { align-self: flex-start; align-items: flex-start; }
    .chx-bub {
      padding: 9px 12px; border-radius: 12px;
      font-size: 13px; line-height: 1.45;
      word-wrap: break-word; overflow-wrap: break-word;
      white-space: pre-wrap;
    }
    .chx-msg--me .chx-bub { background: #1256E3; color: #fff; border-bottom-right-radius: 4px; }
    .chx-msg--admin .chx-bub { background: #fff; color: #0b2d4f; border: 1px solid #e5ebf2; border-bottom-left-radius: 4px; }
    .chx-meta { font-size: 10px; color: #6b7a8e; margin-top: 2px; font-family: 'JetBrains Mono', monospace; }
    .chx-form {
      display: flex; gap: 6px; padding: 10px;
      border-top: 1px solid #e5ebf2; background: #fff;
    }
    .chx-form input {
      flex: 1; padding: 9px 12px; border: 1px solid #e5ebf2;
      border-radius: 9px; font-size: 13px; font-family: inherit; color: #0b2d4f;
      outline: none;
    }
    .chx-form input:focus { border-color: #1256E3; box-shadow: 0 0 0 3px rgba(18,86,227,.12); }
    .chx-form button {
      background: #1256E3; color: #fff; border: none; cursor: pointer;
      padding: 0 14px; border-radius: 9px; font-weight: 600; font-size: 13px;
      font-family: inherit;
    }
    .chx-form button:disabled { opacity: .5; cursor: not-allowed; }
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ----- inject DOM -----
  const root = document.createElement('div');
  root.className = 'chx-root';
  root.innerHTML = `
    <button class="chx-bubble" type="button" id="chxToggle" aria-label="Open support chat">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
      <span class="chx-count" id="chxCount" style="display:none">0</span>
    </button>
    <div class="chx-panel" id="chxPanel" style="display:none">
      <div class="chx-head">
        <div>
          <strong>Support</strong>
          <div class="chx-head__sub">We usually reply within a few hours</div>
        </div>
        <button class="chx-close" type="button" id="chxClose" aria-label="Close">×</button>
      </div>
      <div class="chx-msgs" id="chxMsgs"></div>
      <form class="chx-form" id="chxForm">
        <input id="chxInput" autocomplete="off" placeholder="Type a message…" maxlength="4000" />
        <button type="submit" id="chxSend">Send</button>
      </form>
    </div>
  `;
  document.body.appendChild(root);

  const $count   = document.getElementById('chxCount');
  const $panel   = document.getElementById('chxPanel');
  const $toggle  = document.getElementById('chxToggle');
  const $msgs    = document.getElementById('chxMsgs');
  const $input   = document.getElementById('chxInput');
  const $form    = document.getElementById('chxForm');
  const $send    = document.getElementById('chxSend');

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  let messages = [];

  function render() {
    if (!messages.length) {
      $msgs.innerHTML = `
        <div class="chx-empty">
          <strong>Hi 👋</strong>
          Send us a message and our team will get back to you here.
        </div>`;
      return;
    }
    $msgs.innerHTML = messages.map(m => `
      <div class="chx-msg chx-msg--${m.from_admin ? 'admin' : 'me'}">
        <div class="chx-bub">${escapeHtml(m.body)}</div>
        <div class="chx-meta">${escapeHtml(fmtTime(m.created_at))}</div>
      </div>
    `).join('');
    $msgs.scrollTop = $msgs.scrollHeight;
  }

  function updateBadge() {
    const unread = messages.filter(m => m.from_admin && !m.read_by_user).length;
    if (unread > 0 && $panel.style.display === 'none') {
      $count.textContent = unread;
      $count.style.display = '';
    } else {
      $count.style.display = 'none';
    }
  }

  async function load() {
    const { data, error } = await sb
      .from('chat_messages')
      .select('id, sender_id, body, from_admin, read_by_user, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    if (error) { return; }
    messages = data || [];
    render();
    updateBadge();
  }

  async function markRead() {
    await sb
      .from('chat_messages')
      .update({ read_by_user: true })
      .eq('user_id', user.id)
      .eq('from_admin', true)
      .eq('read_by_user', false);
    messages.forEach(m => { if (m.from_admin) m.read_by_user = true; });
    updateBadge();
  }

  $toggle.addEventListener('click', async () => {
    $panel.style.display = 'flex';
    $toggle.style.display = 'none';
    await markRead();
    $input.focus();
  });

  document.getElementById('chxClose').addEventListener('click', () => {
    $panel.style.display = 'none';
    $toggle.style.display = '';
    updateBadge();
  });

  $form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = $input.value.trim();
    if (!body) return;
    $send.disabled = true; $input.disabled = true;
    const { error } = await sb.from('chat_messages').insert({
      user_id:      user.id,
      sender_id:    user.id,
      body,
      from_admin:   false,
      read_by_user: true,
      read_by_admin: false,
    });
    $send.disabled = false; $input.disabled = false;
    if (error) {
      if (/relation .* does not exist|schema cache/.test(error.message)) {
        alert('Chat isn\'t set up yet — please ask the admin to run db/chat.sql in Supabase.');
      } else {
        alert('Could not send: ' + error.message);
      }
      return;
    }
    $input.value = '';
    $input.focus();
    // realtime will push the new row, but reload anyway for instant local echo
    await load();
  });

  // ----- Realtime: new messages in this user's thread -----
  sb.channel('chat-user-' + user.id)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'chat_messages',
      filter: `user_id=eq.${user.id}`,
    }, () => load())
    .subscribe();

  await load();
})();
