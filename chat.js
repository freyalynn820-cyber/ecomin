// ============================================================
// Core Hash · Floating support-chat widget
//
// Drop-in <script src="/chat.js"></script> on ANY page (marketing,
// auth, or signed-in app). Two operating modes:
//
//   1. AUTHENTICATED — when a Supabase session exists, the widget
//      reads/writes chat_messages keyed on user_id = auth.uid().
//
//   2. ANONYMOUS — when there's no session (marketing/landing
//      visitors), the widget generates a visitor UUID in
//      localStorage and uses visitor_id + visitor_name +
//      visitor_email columns to track the thread. The visitor is
//      asked for name + email the first time they open the panel.
//
// Realtime: subscribes to INSERTs on public.chat_messages filtered
// by the appropriate column so admin replies arrive without a
// refresh.
// ============================================================
(async () => {
  if (window.__chxLoaded) return;
  window.__chxLoaded = true;

  const sb = window.getSupabase ? window.getSupabase() : null;
  if (!sb) return;

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
    .chx-body { flex: 1; display: flex; flex-direction: column; min-height: 0; }
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
    .chx-capture {
      padding: 20px 18px; background: #fff;
      display: flex; flex-direction: column; gap: 10px;
    }
    .chx-capture h4 { margin: 0 0 4px; font-size: 15px; color: #0b2d4f; }
    .chx-capture p  { margin: 0 0 8px; font-size: 12px; color: #6b7a8e; line-height: 1.5; }
    .chx-capture input {
      padding: 10px 12px; border: 1px solid #e5ebf2; border-radius: 9px;
      font-size: 13px; font-family: inherit; color: #0b2d4f; outline: none;
    }
    .chx-capture input:focus { border-color: #1256E3; box-shadow: 0 0 0 3px rgba(18,86,227,.12); }
    .chx-capture button {
      background: #1256E3; color: #fff; border: none; cursor: pointer;
      padding: 10px 14px; border-radius: 9px; font-weight: 600; font-size: 13px;
      font-family: inherit; margin-top: 4px;
    }
    .chx-capture button:disabled { opacity: .5; cursor: not-allowed; }
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
          <div class="chx-head__sub" id="chxHeadSub">We usually reply within a few hours</div>
        </div>
        <button class="chx-close" type="button" id="chxClose" aria-label="Close">×</button>
      </div>
      <div class="chx-body" id="chxBody"></div>
    </div>
  `;
  document.body.appendChild(root);

  const $count  = document.getElementById('chxCount');
  const $panel  = document.getElementById('chxPanel');
  const $toggle = document.getElementById('chxToggle');
  const $close  = document.getElementById('chxClose');
  const $body   = document.getElementById('chxBody');
  const $subhead = document.getElementById('chxHeadSub');

  // ----- helpers -----
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
  function uuid() {
    // RFC4122 v4-ish, good enough for visitor ids
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // ----- bubble open/close -----
  let panelOpen = false;
  $toggle.addEventListener('click', async () => {
    $panel.style.display = 'flex';
    $toggle.style.display = 'none';
    $count.style.display = 'none';
    panelOpen = true;
    await onOpen();
  });
  $close.addEventListener('click', () => {
    $panel.style.display = 'none';
    $toggle.style.display = '';
    panelOpen = false;
    updateBadge();
  });

  // ----- shared message rendering -----
  function renderMsgs(msgs) {
    if (!msgs.length) {
      return `<div class="chx-empty">
        <strong>Hi 👋</strong>
        Send us a message and our team will get back to you here.
      </div>`;
    }
    return msgs.map(m => `
      <div class="chx-msg chx-msg--${m.from_admin ? 'admin' : 'me'}">
        <div class="chx-bub">${escapeHtml(m.body)}</div>
        <div class="chx-meta">${escapeHtml(fmtTime(m.created_at))}</div>
      </div>
    `).join('');
  }

  // ============================================================
  // AUTHENTICATED MODE — when there's a Supabase session
  // ============================================================
  async function setupAuthed(user) {
    let messages = [];

    function render() {
      $body.innerHTML = `
        <div class="chx-msgs" id="chxMsgs">${renderMsgs(messages)}</div>
        <form class="chx-form" id="chxForm">
          <input id="chxInput" autocomplete="off" placeholder="Type a message…" maxlength="4000" />
          <button type="submit" id="chxSend">Send</button>
        </form>`;
      const $msgs = document.getElementById('chxMsgs');
      $msgs.scrollTop = $msgs.scrollHeight;
      document.getElementById('chxForm').addEventListener('submit', onSend);
    }

    async function load() {
      const { data, error } = await sb
        .from('chat_messages')
        .select('id, sender_id, body, from_admin, read_by_user, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      if (error) return;
      messages = data || [];
      if (panelOpen) render(); else updateBadge();
    }

    async function markRead() {
      await sb.from('chat_messages').update({ read_by_user: true })
        .eq('user_id', user.id).eq('from_admin', true).eq('read_by_user', false);
      messages.forEach(m => { if (m.from_admin) m.read_by_user = true; });
    }

    async function onSend(e) {
      e.preventDefault();
      const input = document.getElementById('chxInput');
      const send  = document.getElementById('chxSend');
      const body  = input.value.trim();
      if (!body) return;
      send.disabled = true; input.disabled = true;
      const { error } = await sb.from('chat_messages').insert({
        user_id: user.id, sender_id: user.id, body,
        from_admin: false, read_by_user: true, read_by_admin: false,
      });
      send.disabled = false; input.disabled = false;
      if (error) {
        if (/relation .* does not exist|schema cache/.test(error.message)) {
          alert('Chat isn\'t fully set up yet — run db/chat.sql + db/chat-anonymous.sql in Supabase.');
        } else {
          alert('Could not send: ' + error.message);
        }
        return;
      }
      input.value = ''; input.focus();
      await load();
    }

    window.__chxState = {
      mode: 'authed',
      onOpen: async () => { render(); await markRead(); document.getElementById('chxInput')?.focus(); },
      unread: () => messages.filter(m => m.from_admin && !m.read_by_user).length,
    };

    sb.channel('chat-user-' + user.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `user_id=eq.${user.id}`,
      }, () => load())
      .subscribe();

    await load();
  }


  // ============================================================
  // ANONYMOUS MODE — visitor with no session
  // ============================================================
  async function setupAnon() {
    let visitorId    = localStorage.getItem('chx_visitor_id');
    let visitorName  = localStorage.getItem('chx_visitor_name');
    let visitorEmail = localStorage.getItem('chx_visitor_email');
    if (!visitorId) {
      visitorId = uuid();
      localStorage.setItem('chx_visitor_id', visitorId);
    }
    let messages = [];

    function renderCapture() {
      $body.innerHTML = `
        <div class="chx-capture">
          <h4>Before we begin</h4>
          <p>Tell us who you are so our team can follow up by email if needed.</p>
          <input id="chxName"  placeholder="Your name"   autocomplete="name"  value="${escapeHtml(visitorName || '')}"  maxlength="120" />
          <input id="chxEmail" placeholder="Email address" autocomplete="email" type="email" value="${escapeHtml(visitorEmail || '')}" maxlength="200" />
          <button id="chxStart" type="button">Start chatting</button>
        </div>`;
      document.getElementById('chxStart').addEventListener('click', () => {
        const n = document.getElementById('chxName').value.trim();
        const em = document.getElementById('chxEmail').value.trim();
        if (!n)  return document.getElementById('chxName').focus();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return document.getElementById('chxEmail').focus();
        visitorName = n; visitorEmail = em;
        localStorage.setItem('chx_visitor_name', n);
        localStorage.setItem('chx_visitor_email', em);
        renderChat();
        document.getElementById('chxInput')?.focus();
      });
    }

    function renderChat() {
      $body.innerHTML = `
        <div class="chx-msgs" id="chxMsgs">${renderMsgs(messages)}</div>
        <form class="chx-form" id="chxForm">
          <input id="chxInput" autocomplete="off" placeholder="Type a message…" maxlength="4000" />
          <button type="submit" id="chxSend">Send</button>
        </form>`;
      const $msgs = document.getElementById('chxMsgs');
      $msgs.scrollTop = $msgs.scrollHeight;
      document.getElementById('chxForm').addEventListener('submit', onSend);
    }

    async function load() {
      const { data, error } = await sb
        .from('chat_messages')
        .select('id, body, from_admin, read_by_user, created_at')
        .eq('visitor_id', visitorId)
        .order('created_at', { ascending: true });
      if (error) {
        // table or columns missing — render empty
        return;
      }
      messages = data || [];
      if (panelOpen) {
        const $msgs = document.getElementById('chxMsgs');
        if ($msgs) { $msgs.innerHTML = renderMsgs(messages); $msgs.scrollTop = $msgs.scrollHeight; }
      } else {
        updateBadge();
      }
    }

    async function markRead() {
      if (!messages.some(m => m.from_admin && !m.read_by_user)) return;
      await sb.from('chat_messages').update({ read_by_user: true })
        .eq('visitor_id', visitorId).eq('from_admin', true).eq('read_by_user', false);
      messages.forEach(m => { if (m.from_admin) m.read_by_user = true; });
    }

    async function onSend(e) {
      e.preventDefault();
      const input = document.getElementById('chxInput');
      const send  = document.getElementById('chxSend');
      const body  = input.value.trim();
      if (!body) return;
      send.disabled = true; input.disabled = true;
      const { error } = await sb.from('chat_messages').insert({
        user_id:       null,
        sender_id:     null,
        visitor_id:    visitorId,
        visitor_name:  visitorName,
        visitor_email: visitorEmail,
        body,
        from_admin:    false,
        read_by_user:  true,
        read_by_admin: false,
      });
      send.disabled = false; input.disabled = false;
      if (error) {
        if (/relation .* does not exist|schema cache|column .* does not exist/.test(error.message)) {
          alert('Chat isn\'t fully set up yet — run db/chat.sql + db/chat-anonymous.sql in Supabase.');
        } else {
          alert('Could not send: ' + error.message);
        }
        return;
      }
      input.value = ''; input.focus();
      await load();
    }

    window.__chxState = {
      mode: 'anon',
      onOpen: async () => {
        if (!visitorName || !visitorEmail) renderCapture();
        else { renderChat(); await markRead(); document.getElementById('chxInput')?.focus(); }
      },
      unread: () => messages.filter(m => m.from_admin && !m.read_by_user).length,
    };

    sb.channel('chat-visitor-' + visitorId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `visitor_id=eq.${visitorId}`,
      }, () => load())
      .subscribe();

    await load();
  }


  // ----- shared open + unread badge -----
  async function onOpen() {
    if (window.__chxState?.onOpen) await window.__chxState.onOpen();
  }
  function updateBadge() {
    if (!window.__chxState) return;
    const unread = window.__chxState.unread() || 0;
    if (unread > 0 && !panelOpen) {
      $count.textContent = unread;
      $count.style.display = '';
    } else {
      $count.style.display = 'none';
    }
  }
  setInterval(updateBadge, 4000);


  // ----- decide mode -----
  const { data: { user } } = await sb.auth.getUser();
  if (user) {
    await setupAuthed(user);
  } else {
    await setupAnon();
  }
})();
