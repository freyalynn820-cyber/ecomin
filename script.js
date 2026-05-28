// ============ Hardware: render rig cards ============
const rigs = [
  { brand: 'Bitmain', name: 'Antminer S21 Pro', hash: '234 TH/s', power: '3,531 W', eff: '15 J/TH', price: '$5,490', stock: 'In stock', feat: true },
  { brand: 'MicroBT', name: 'Whatsminer M60S', hash: '186 TH/s', power: '3,441 W', eff: '18.5 J/TH', price: '$3,890', stock: 'In stock' },
  { brand: 'Bitmain', name: 'Antminer S19 XP', hash: '140 TH/s', power: '3,010 W', eff: '21.5 J/TH', price: '$2,640', stock: 'Ships May 18' },
  { brand: 'Canaan', name: 'Avalon A1566', hash: '185 TH/s', power: '3,420 W', eff: '18.5 J/TH', price: '$3,120', stock: 'In stock' },
];

function rigArt() {
  return `
    <svg viewBox="0 0 220 140" width="100%" height="140" aria-hidden="true">
      <rect x="22" y="34" width="176" height="82" rx="6" fill="#d9e3f0"/>
      <rect x="22" y="34" width="176" height="10" fill="#cdd9ea"/>
      ${Array.from({ length: 14 }).map((_, i) =>
        `<rect x="${32 + i * 11}" y="50" width="7" height="58" rx="1.5" fill="#c0d0e4"/>`
      ).join('')}
      <rect x="22" y="116" width="176" height="4" fill="#b7c6dc"/>
      <circle cx="190" cy="39" r="2" fill="#1256E3"/>
      <rect x="84" y="120" width="52" height="8" rx="2" fill="#b7c6dc"/>
    </svg>
  `;
}

function rigCardHTML(r) {
  const stockClass = r.stock.startsWith('In') ? 'rcard__spec-v--ok' : 'rcard__spec-v--warn';
  return `
    <article class="rcard">
      ${r.feat ? `<div class="rcard__badge">MOST POPULAR</div>` : ''}
      <div class="rcard__art">${rigArt()}</div>
      <div class="rcard__brand">${r.brand}</div>
      <div class="rcard__name">${r.name}</div>
      <div class="rcard__specs">
        <div><div class="rcard__spec-l">Hashrate</div><div class="rcard__spec-v">${r.hash}</div></div>
        <div><div class="rcard__spec-l">Power</div><div class="rcard__spec-v">${r.power}</div></div>
        <div><div class="rcard__spec-l">Efficiency</div><div class="rcard__spec-v">${r.eff}</div></div>
        <div><div class="rcard__spec-l">Status</div><div class="rcard__spec-v ${stockClass}">${r.stock}</div></div>
      </div>
      <div class="rcard__foot">
        <div>
          <div class="rcard__from">from</div>
          <div class="rcard__price">${r.price}</div>
        </div>
        <a href="#" class="btn ${r.feat ? 'btn--primary' : 'btn--ghost'} btn--sm">Buy <span class="i-arrow"></span></a>
      </div>
    </article>
  `;
}

document.querySelector('.rigs-grid').innerHTML = rigs.map(rigCardHTML).join('');

// ============ Hardware filter chips ============
document.querySelectorAll('.chips .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chips .chip').forEach((c) => {
      c.classList.remove('is-active');
      c.setAttribute('aria-selected', 'false');
    });
    chip.classList.add('is-active');
    chip.setAttribute('aria-selected', 'true');
  });
});

// ============ Pricing toggle ============
document.querySelectorAll('.toggle .toggle__opt').forEach((opt) => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('.toggle .toggle__opt').forEach((o) => o.classList.remove('is-active'));
    opt.classList.add('is-active');
  });
});

// ============ FAQ accordion ============
document.querySelectorAll('.faq__item').forEach((item) => {
  const btn = item.querySelector('.faq__q');
  btn.addEventListener('click', () => {
    const isOpen = item.classList.contains('is-open');
    document.querySelectorAll('.faq__item').forEach((i) => {
      i.classList.remove('is-open');
      i.querySelector('.faq__q').setAttribute('aria-expanded', 'false');
    });
    if (!isOpen) {
      item.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
    }
  });
});
