// ============================================================
// Core Hash · Mobile nav + responsive overlay
//
// One-file drop-in: <script src="/mobile.js"></script> on any page.
//
// What it does on viewports ≤ 760px:
//   - Adds a hamburger button to the topbar / marketing nav.
//   - Converts the sidebar (.side) into a slide-in drawer from the
//     left (existing nav contents preserved verbatim).
//   - For the marketing landing (no sidebar), builds a slide-in
//     menu from the right containing nav links + Sign in / Start
//     mining CTAs.
//   - A backdrop + Escape key + clicking any drawer link closes it.
//   - Trims padding, stacks two-column grids, hides decorative bits
//     (lang switcher, BTC ticker), enables horizontal scrolling on
//     wide tables, shrinks oversized hero/headline type.
//
// Auth pages (login/register/reset) have no topbar — the script
// runs but no-ops gracefully there; their own CSS already stacks
// the split layout on small viewports.
// ============================================================
(() => {
  if (window.__mnavLoaded) return;
  window.__mnavLoaded = true;

  // ---------- CSS ----------
  const css = `
    .mnav-burger {
      display: none;
      width: 40px; height: 40px;
      align-items: center; justify-content: center;
      border-radius: 9px;
      border: 1px solid #e5ebf2;
      background: #fff;
      cursor: pointer; padding: 0; flex: 0 0 auto;
      color: #0b2d4f;
    }
    .mnav-burger:hover { border-color: #0b2d4f; }
    .mnav-burger svg { width: 22px; height: 22px; }

    .mnav-backdrop {
      display: none;
      position: fixed; inset: 0;
      background: rgba(11,45,79,.55);
      z-index: 998;
      animation: mnavFade .15s ease;
    }
    .mnav-backdrop.is-open { display: block; }
    @keyframes mnavFade { from { opacity: 0; } to { opacity: 1; } }

    /* Marketing drawer (built from .nav__links) */
    .mnav-drawer {
      position: fixed;
      top: 0; right: 0;
      width: 300px; max-width: 86vw;
      height: 100vh; height: 100dvh;
      background: #fff;
      box-shadow: -16px 0 32px -8px rgba(11,45,79,.3);
      transform: translateX(100%);
      transition: transform .25s cubic-bezier(.2,.7,.2,1);
      z-index: 999;
      display: flex; flex-direction: column;
      overflow-y: auto;
      padding: 18px;
      gap: 4px;
      font-family: 'Inter Tight', system-ui, sans-serif;
    }
    .mnav-drawer.is-open { transform: translateX(0); }
    .mnav-drawer__head {
      display: flex; justify-content: space-between; align-items: center;
      padding-bottom: 14px; margin-bottom: 6px;
      border-bottom: 1px solid #e5ebf2;
    }
    .mnav-drawer__head strong { font-size: 16px; font-weight: 700; color: #0b2d4f; }
    .mnav-drawer__close {
      width: 32px; height: 32px; border-radius: 8px;
      background: #f5f8fc; border: none; cursor: pointer;
      font-size: 22px; line-height: 1; color: #0b2d4f;
    }
    .mnav-drawer__close:hover { background: #e5ebf2; }
    .mnav-drawer a {
      display: block;
      padding: 12px 10px;
      color: #0b2d4f;
      text-decoration: none;
      font-size: 14px; font-weight: 500;
      border-radius: 8px;
    }
    .mnav-drawer a:hover { background: #f5f8fc; }
    .mnav-drawer__cta {
      margin-top: auto; padding-top: 14px;
      border-top: 1px solid #e5ebf2;
      display: flex; flex-direction: column; gap: 8px;
    }
    .mnav-drawer__cta a {
      text-align: center;
      padding: 12px 16px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 14px;
    }
    .mnav-drawer__cta-primary { background: #1256E3; color: #fff !important; }
    .mnav-drawer__cta-primary:hover { background: #0e43b4; }
    .mnav-drawer__cta-ghost {
      background: #fff; color: #0b2d4f !important;
      border: 1px solid #e5ebf2;
    }
    .mnav-drawer__cta-ghost:hover { border-color: #0b2d4f; }

    /* ===== Mobile breakpoint ===== */
    @media (max-width: 760px) {
      .mnav-burger { display: inline-flex; }

      /* Sidebar -> slide-in drawer from the left */
      .side {
        position: fixed !important;
        top: 0; left: 0;
        width: 280px !important;
        max-width: 86vw;
        height: 100vh !important;
        height: 100dvh !important;
        transform: translateX(-100%);
        transition: transform .25s cubic-bezier(.2,.7,.2,1);
        z-index: 999;
        overflow-y: auto !important;
        box-shadow: 16px 0 32px -8px rgba(0,0,0,.4);
      }
      .side.is-open { transform: translateX(0); }

      /* App container collapses to a single column */
      .app { display: block !important; grid-template-columns: none !important; }

      /* Marketing nav: hide inline links + lang switcher (drawer takes over) */
      .nav__links { display: none !important; }
      .nav__right .lang, .topbar .lang { display: none !important; }

      /* Topbar polish */
      .topbar {
        padding: 10px 14px !important;
        gap: 8px !important;
        flex-wrap: wrap;
      }
      .ticker { display: none !important; }
      .topbar .crumb,
      .topbar .crumb a, .topbar .crumb strong { font-size: 12px !important; }
      .topbar__right { gap: 8px !important; }
      .user .user__name { display: none; }
      .icon-btn { display: none; }
      .search { display: none !important; }

      /* Marketing nav inner spacing */
      .nav__inner { padding: 12px 0 !important; }
      .nav__left { gap: 12px !important; }
      .nav__right { gap: 6px !important; }
      .nav__right .btn { padding: 8px 12px !important; font-size: 12px !important; }

      /* Content padding */
      .content { padding: 16px !important; }
      .container { padding: 0 18px !important; }

      /* Hero (landing) */
      .hero { padding: 36px 0 24px !important; }
      .hero__title {
        font-size: 38px !important; line-height: 1.05 !important;
        letter-spacing: -1.2px !important;
      }
      .hero__sub { font-size: 15px !important; }
      .hero__grid { grid-template-columns: 1fr !important; gap: 24px !important; }
      .hero__stats { gap: 16px !important; flex-wrap: wrap; padding-top: 18px !important; }
      .hero__ctas { flex-wrap: wrap; }
      .stat__value span { font-size: 30px !important; }
      .stat__label { font-size: 12px; }

      /* Section headers */
      .section-head { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }
      .section-head__title { font-size: 24px !important; }

      /* Page heads */
      .page-head { flex-direction: column !important; align-items: flex-start !important; gap: 10px !important; }
      .page-head h1 { font-size: 22px !important; }

      /* Greeting on dashboard */
      .greeting { flex-direction: column !important; align-items: flex-start !important; gap: 10px !important; }
      .greeting h1 { font-size: 22px !important; }

      /* Account/balance card */
      .account { grid-template-columns: 1fr !important; }
      .acard { padding: 18px !important; }
      .acard__balance-row { font-size: 13px !important; }
      .acard__actions { flex-wrap: wrap; gap: 6px !important; }
      .acard__actions .btn { flex: 1 1 auto; min-width: 0; }

      /* Two- and three-column generic grids */
      .grid-2, .grid-3 { grid-template-columns: 1fr !important; gap: 14px !important; }
      .row-2 { grid-template-columns: 1fr !important; gap: 12px !important; }
      .dep-grid { grid-template-columns: 1fr !important; gap: 16px !important; }
      .form-row {
        grid-template-columns: 1fr !important;
        padding: 14px 16px !important;
        gap: 10px !important;
      }
      .form-row__r { flex-wrap: wrap; }

      /* Tables: horizontal scroll wrapper */
      .table-wrap { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
      .table { min-width: 540px; }

      /* KPIs and mini-KPIs */
      .kpi { grid-template-columns: 1fr 1fr !important; }
      .mini-kpi { grid-template-columns: 1fr 1fr !important; gap: 10px !important; }

      /* Chip rows: allow wrap */
      .chips { flex-wrap: wrap; }

      /* Cards: less internal padding */
      .section-card__head { padding: 14px 16px !important; }
      .section-card { margin-bottom: 14px !important; }

      /* Pricing / plans grids */
      .plans { grid-template-columns: 1fr !important; gap: 14px !important; }
      .rigs-grid, .pricing-grid { grid-template-columns: 1fr !important; }

      /* Footer columns stack */
      .footer__grid { grid-template-columns: 1fr !important; gap: 24px !important; }
      .footer { padding: 48px 0 24px !important; }
      .footer__bar { flex-direction: column !important; align-items: flex-start !important; gap: 10px !important; }

      /* Calculator (rent-asics) wraps */
      .calc { flex-wrap: wrap !important; }
      .calc__field { flex: 1 1 100%; min-width: 0; }

      /* Trim chat bubble so it doesn't crowd small screens */
      .chx-root { bottom: 14px !important; right: 14px !important; }
      .chx-bubble { width: 50px !important; height: 50px !important; }

      /* Vault hero typography */
      .vhero { padding: 22px !important; }
      .vhero__apy { font-size: 48px !important; }

      /* How-it-works steps stack */
      .how { grid-template-columns: 1fr !important; }

      /* Active-vault row: 2 columns instead of 5 */
      .vrow { grid-template-columns: 1fr 1fr !important; gap: 12px !important; }
    }
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ---------- Locate the topbar / nav ----------
  const topbar = document.querySelector('.topbar') || document.querySelector('.nav__inner');
  if (!topbar) return;                              // auth pages: no menu needed

  const isMarketingNav = topbar.classList.contains('nav__inner');

  // ---------- Build hamburger ----------
  const burger = document.createElement('button');
  burger.type = 'button';
  burger.className = 'mnav-burger';
  burger.setAttribute('aria-label', 'Open menu');
  burger.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<line x1="3" y1="6"  x2="21" y2="6"/>' +
    '<line x1="3" y1="12" x2="21" y2="12"/>' +
    '<line x1="3" y1="18" x2="21" y2="18"/></svg>';

  if (isMarketingNav) {
    // Push hamburger into nav__right so the logo stays on the left.
    const navRight = topbar.querySelector('.nav__right') || topbar;
    navRight.insertBefore(burger, navRight.firstChild);
  } else {
    topbar.insertBefore(burger, topbar.firstChild);
  }

  // ---------- Build backdrop ----------
  const backdrop = document.createElement('div');
  backdrop.className = 'mnav-backdrop';
  document.body.appendChild(backdrop);

  // ---------- Decide drawer source ----------
  const sidebar = document.querySelector('.side');
  let drawer = sidebar;

  if (!drawer) {
    // Marketing: build a slide-in panel from nav__links
    const navLinks = document.querySelector('.nav__links');
    drawer = document.createElement('aside');
    drawer.className = 'mnav-drawer';
    drawer.innerHTML =
      '<div class="mnav-drawer__head">' +
        '<strong>Menu</strong>' +
        '<button class="mnav-drawer__close" type="button" aria-label="Close menu">×</button>' +
      '</div>';

    if (navLinks) {
      navLinks.querySelectorAll('a').forEach(a => drawer.appendChild(a.cloneNode(true)));
    }

    const cta = document.createElement('div');
    cta.className = 'mnav-drawer__cta';
    cta.innerHTML =
      '<a href="login.html"    class="mnav-drawer__cta-ghost">Sign in</a>' +
      '<a href="register.html" class="mnav-drawer__cta-primary">Start mining →</a>';
    drawer.appendChild(cta);

    document.body.appendChild(drawer);

    drawer.querySelector('.mnav-drawer__close').addEventListener('click', closeDrawer);
  }

  // ---------- Open / close ----------
  function openDrawer() {
    drawer.classList.add('is-open');
    backdrop.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    burger.setAttribute('aria-expanded', 'true');
  }
  function closeDrawer() {
    drawer.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    document.body.style.overflow = '';
    burger.setAttribute('aria-expanded', 'false');
  }

  burger.addEventListener('click', openDrawer);
  backdrop.addEventListener('click', closeDrawer);

  // Close when any link inside the drawer is clicked
  drawer.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;
    // Allow same-page anchors to scroll, but still close the drawer
    closeDrawer();
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });

  // Close + reset overflow if we cross back above the breakpoint
  const mq = window.matchMedia('(max-width: 760px)');
  if (mq.addEventListener) {
    mq.addEventListener('change', (ev) => { if (!ev.matches) closeDrawer(); });
  }
})();
