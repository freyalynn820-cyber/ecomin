// Shared session gate + topbar wiring for store sub-pages.
// Pages must include #app (hidden by default), #userEmail, #userAvatar,
// #logoutLink, and optionally #adminLink.

(async () => {
  const sb = window.getSupabase ? window.getSupabase() : null;
  if (!sb) return;

  const { data: { session } } = await sb.auth.getSession();
  if (!session?.user) {
    window.location.replace('../login.html');
    return;
  }

  const u = session.user;
  const emailEl = document.getElementById('userEmail');
  const avatarEl = document.getElementById('userAvatar');
  if (emailEl) emailEl.textContent = u.email;
  if (avatarEl) avatarEl.textContent = (u.email[0] || '?').toUpperCase();

  if (u.app_metadata?.role === 'admin') {
    const link = document.getElementById('adminLink');
    if (link) link.style.display = '';
  }

  const logout = document.getElementById('logoutLink');
  if (logout) {
    logout.addEventListener('click', async (e) => {
      e.preventDefault();
      await sb.auth.signOut();
      window.location.href = '../login.html';
    });
  }

  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') window.location.replace('../login.html');
  });

  document.getElementById('app').style.display = '';

  // Tiny toast helper available to page scripts
  window.ecoToast = function (msg) {
    let t = document.getElementById('ecoToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'ecoToast';
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.innerHTML = '<span class="ok">●</span> ' + msg;
    t.classList.add('is-show');
    clearTimeout(window.__ecoToastTimer);
    window.__ecoToastTimer = setTimeout(() => t.classList.remove('is-show'), 2400);
  };
})();
