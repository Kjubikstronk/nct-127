/* ═══════════════════════════════════════════════════════════════════════
   NCT 127

   One fetch of data/site.json; everything on the page derives from it. No
   dependencies, no build step, no second request, no API key.

   Three things here are load-bearing and easy to "tidy" into bugs:

   1. Data-driven <img> elements ship with no src and get one assigned here.
      The browser starts fetching from parsed markup before any script runs,
      so a placeholder src 404s on every load, and wrapping the tag in a
      conditional does not help — the parse happens first.
   2. The countdown and the HUD rail's T-nD string come from ONE diff. Two
      timers drift apart within a day and then disagree on screen.
   3. Discography visibility is computed by one function from (filter,
      expanded). Letting the chips and the expander each toggle `hidden`
      independently makes them undo each other — the sibling press-it build
      hit exactly that.
   ═══════════════════════════════════════════════════════════════════════ */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ─── derived helpers ────────────────────────────────────────────────── */

/** Apple appends the format to titles; nobody says "WALK - The 6th Album". */
const tidy = (t = '') =>
  t
    .replace(/\s*[-–—]\s*The\s+\d+(st|nd|rd|th)\s+Album(\s+Repackage)?\b.*$/i, '')
    .replace(/\s*[-–—]\s*(Single|EP)$/i, '')
    .replace(/\s*[-–—]\s*The\s+\d+(st|nd|rd|th)\s+Mini\s+Album\b.*$/i, '')
    .replace(/\s*\[[^\]]*\]\s*$/, '')
    .trim() || t;

const fmtDate = (iso, opts = { year: 'numeric', month: 'short', day: 'numeric' }) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-US', opts) : '';

const dotted = (iso) => (iso ? iso.replace(/-/g, '.') : '');
const pad2 = (n) => String(n).padStart(2, '0');

const relative = (iso) => {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso + 'T00:00:00')) / 864e5);
  if (days < 1) return 'today';
  if (days < 2) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${(days / 365.25).toFixed(1).replace(/\.0$/, '')} years ago`;
};

const setImg = (el, url) => { if (el && url) el.setAttribute('src', url); };

/** A stripe with a caption, so a missing image reads as intent not breakage. */
const placeholder = (label) => `<div class="ph">${esc(label)}</div>`;

/* ─── state ──────────────────────────────────────────────────────────── */

let DATA = null;
const S = { filter: 'All', disco: false, videos: false, news: false, timeline: false, fact: 0 };
const CAPS = { disco: 12, videos: 6, news: 7, timeline: 7 };

/* ─── boot ───────────────────────────────────────────────────────────── */

async function boot() {
  try {
    const res = await fetch('data/site.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    DATA = await res.json();
  } catch (err) {
    console.error('Could not load data/site.json —', err);
    const host = $('[data-wire]');
    if (host) host.innerHTML = `<p class="wire__cell empty">Couldn't load the data file. The page is static, so a refresh usually fixes it.</p>`;
    return;
  }

  renderStamps();
  renderHero();
  renderWire();
  renderLineup();
  renderTour();
  renderDiscography();
  renderVideos();
  renderNews();
  renderTimeline();
  renderFacts();
  renderFooter();

  startCountdown();
  initActiveNav();
}

/* ─── stamps ─────────────────────────────────────────────────────────── */

/**
 * Ask the CDN for the size actually being displayed.
 *
 * Apple and Deezer both serve any square size off the same path, and
 * build.js stores one large URL per release — so a 600px cover was being
 * downloaded for a card that renders around 200px. At these dimensions the
 * bytes scale roughly with area: the same sleeve is 136 kB at 600px and
 * 39 kB at 300px.
 *
 * A URL from an unrecognised host is returned untouched, so a source
 * changing its path shape costs the optimisation, never the image.
 */
const sized = (url = '', px) =>
  url
    .replace(/\/\d+x\d+bb\.(jpg|png)/, `/${px}x${px}bb.$1`)
    .replace(/\/\d+x\d+(-000000-[\d-]+\.jpg)/, `/${px}x${px}$1`);

/** srcset for a fluid slot, so a retina screen still gets a sharp cover. */
const srcset = (url, ...widths) =>
  widths.map((w) => `${sized(url, w)} ${w}w`).join(', ');

function renderStamps() {
  const gen = DATA.generated ? new Date(DATA.generated) : null;
  if (!gen) return;
  const short = $('[data-generated]');
  if (short) short.textContent = `updated ${relative(gen.toISOString().slice(0, 10))}`;
  const full = $('[data-generated-full]');
  if (full) {
    full.textContent =
      `Last rebuild — ${gen.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`;
  }
  const stamp = $('[data-wire-stamp]');
  if (stamp) {
    stamp.textContent =
      `last checked ${gen.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} · every 6 hours`;
  }
}

/* ─── hero ───────────────────────────────────────────────────────────── */

function renderHero() {
  const drop = DATA.drop || {};
  const st = DATA.stats || {};
  const rel = drop.release; // real catalogue entry, once it exists

  const badge = $('[data-drop-badge]');
  if (badge) {
    const out = dropMs() <= 0;
    badge.firstChild.textContent = out ? 'Out now' : 'Pre-order open';
  }

  const meta = $('[data-drop-meta]');
  if (meta) {
    meta.textContent = [
      drop.kind,
      drop.date ? dotted(drop.date.slice(0, 10)) : '',
      drop.trackCount ? `${drop.trackCount} tracks` : '',
    ].filter(Boolean).join(' · ');
  }

  const line = $('[data-drop-line]');
  if (line && drop.title) {
    line.innerHTML =
      `<b>New album</b><em>${esc(drop.title)}</em>` +
      (drop.date ? `<span>${esc(dotted(drop.date.slice(0, 10)).split('.').reverse().join('.'))}</span>` : '');
  }

  const note = $('[data-drop-note]');
  if (note) note.textContent = drop.note || '';

  /* Cover. Two states, and the second is the one on screen until release day.

     With real artwork it is just the sleeve. Without it, a designed
     "coming soon" plate rather than a bare stripe: the teaser still sits
     behind it desaturated and dimmed so the frame holds an image without
     the still passing as the cover, and the title reads as a promise
     instead of a missing asset. The still is credited in the corner.

     One moving part only — the scan sweep — because the hero already
     carries a radar, a grain layer and its own scan line. */
  const slot = $('.cover__slot');
  const art = rel?.art || rel?.artSmall || null;
  if (slot) {
    if (art) {
      // The frame is min(100%, 400px), so 800 covers it on a retina screen.
      setImg($('[data-drop-art]', slot), sized(art, 800));
    } else {
      const still = drop.standIn?.thumb;
      slot.innerHTML =
        `<div class="soon">` +
          (still
            ? `<img class="soon__bg" src="${esc(still)}" alt="" aria-hidden="true" decoding="async">` +
              `<span class="soon__tint" aria-hidden="true"></span>`
            : '') +
          `<span class="soon__scan" aria-hidden="true"></span>` +
          `<span class="soon__txt">` +
            `<b>${esc(drop.title || 'Album')}</b>` +
            `<i>Cover coming soon</i>` +
          `</span>` +
          (still ? `<span class="soon__src">Teaser still</span>` : '') +
        `</div>`;
    }
  }
  const cap = $('[data-drop-cap]');
  if (cap && drop.kind) {
    cap.innerHTML =
      `<span>${esc(drop.kind)}</span><span>${esc(dotted((drop.date || '').slice(0, 10)))}</span>`;
  }

  /* The primary button's label follows where it actually goes.
     It used to say "Pre-order" and fall back to DATA.latest.url whenever the
     drop wasn't in the catalogue yet — so before release it promised a
     pre-order and delivered the previous album's page. Order of preference:
       1. a curated pre-order URL, once SM publishes one
       2. the real release, once it exists — then it's "Listen"
       3. the newest promo clip, labelled as a teaser
       4. nothing, rather than a button that lies about its destination */
  const cta = $('[data-hero-cta]');
  if (cta) {
    let primary = null;
    if (drop.url) primary = { href: drop.url, label: 'Pre-order ↗' };
    else if (rel?.url) primary = { href: rel.url, label: 'Listen ↗' };
    else if (drop.standIn?.from) primary = { href: drop.standIn.from, label: 'Watch the teaser ↗' };

    cta.innerHTML = [
      primary
        ? `<a class="btn btn--fill" href="${esc(primary.href)}" target="_blank" rel="noopener">${esc(primary.label)}</a>`
        : '',
      `<a class="btn btn--ghost" href="#redline">The Redline tour</a>`,
    ].join('');
  }

  const dates = (DATA.tour?.dates || []).length + (DATA.tour?.pending || []).length;
  const stats = [
    { v: pad2(st.memberCount ?? 0), l: 'Members' },
    { v: pad2(drop.trackCount ?? 0), l: 'Tracks' },
    { v: pad2(dates), l: 'Tour stops' },
    { v: st.yearsSinceDebut ?? '', sup: 'YRS', l: 'Since 2016.07.07' },
  ];
  const host = $('[data-stats]');
  if (host) {
    host.innerHTML = stats
      .filter((s) => s.v !== '' && s.v !== null)
      .map((s) => `
      <div class="stat">
        <span class="stat__v">${esc(s.v)}${s.sup ? `<sup>${esc(s.sup)}</sup>` : ''}</span>
        <span class="stat__l">${esc(s.l)}</span>
      </div>`)
      .join('');
  }
}

/* ─── countdown ──────────────────────────────────────────────────────── */

/** Milliseconds until the drop. Clamped at 0 so it never runs negative. */
function dropMs() {
  const iso = DATA?.drop?.date;
  if (!iso) return 0;
  return Math.max(0, new Date(iso).getTime() - Date.now());
}

/**
 * One interval, one diff. The tiles and the HUD rail's T-nD string both read
 * from it, so they cannot disagree.
 */
function startCountdown() {
  const drop = DATA.drop || {};
  const sec = $('[data-countdown]');
  const tiles = $('[data-cd-tiles]');
  if (!drop.date || !sec || !tiles) { renderHud(null); return; }

  /* Once the drop has landed the band is worse than absent: a "Drops in"
     heading over four zeroes, which is what it showed for four days after
     BLINGY came out. The hero already says Out now and links to the
     release, so the countdown simply goes away. Hidden here rather than in
     CSS so the HUD loses its T-minus item at the same moment. */
  if (dropMs() <= 0) {
    sec.hidden = true;
    renderHud(null);
    return;
  }

  sec.hidden = false;
  const title = $('[data-cd-title]');
  if (title) title.textContent = [drop.title, drop.kind].filter(Boolean).join(' · ');
  const when = $('[data-cd-when]');
  if (when) {
    when.textContent =
      new Date(drop.date).toLocaleString('en-US', { dateStyle: 'long' }) + ' · 18:00 KST';
  }

  const paint = () => {
    const ms = dropMs();

    // Release day, with the page already open: retire the band there and then.
    if (ms <= 0) {
      if (timer) { clearInterval(timer); timer = null; }
      sec.hidden = true;
      renderHud(null);
      return;
    }

    const d = Math.floor(ms / 864e5);
    const h = Math.floor(ms / 36e5) % 24;
    const m = Math.floor(ms / 6e4) % 60;
    const s = Math.floor(ms / 1e3) % 60;

    tiles.innerHTML = [
      ['Days', d, ''], ['Hrs', h, ''], ['Min', m, ''], ['Sec', s, ' tile--sec'],
    ].map(([l, v, k]) => `<div class="tile${k}"><b>${pad2(v)}</b><span>${l}</span></div>`).join('');

    renderHud(d);
  };

  let timer = setInterval(paint, 1000);
  paint();
}

/** The HUD marquee. Duplicated so the -50% translate loops seamlessly. */
function renderHud(daysToDrop) {
  const host = $('[data-hud]');
  if (!host) return;

  const members = (DATA.members || []).length;
  const stops = (DATA.tour?.dates || []).length + (DATA.tour?.pending || []).length;
  const first = (DATA.tour?.dates || [])[0];

  const cells = [
    'NODE 127.0 E',
    `LINEUP ${pad2(members)} ACTIVE`,
    daysToDrop != null ? `${(DATA.drop?.title || 'DROP').toUpperCase()} T-${daysToDrop}D` : null,
    `REDLINE / ${pad2(stops)} STOPS`,
    first ? `${first.city.toUpperCase()} ${fmtDate(first.date, { day: '2-digit', month: 'short' }).toUpperCase()}` : null,
    'ANNIV 10Y',
    'FEED OK',
    'SRC APPLE·DEEZER·YT',
  ].filter(Boolean);

  host.innerHTML = [...cells, ...cells].map((c) => `<span>${esc(c)}</span>`).join('');
}

/* ─── wire ───────────────────────────────────────────────────────────── */

function renderWire() {
  const host = $('[data-wire]');
  if (!host) return;

  const latest = DATA.latest || {};
  const vid = (DATA.videos || [])[0];
  const news = DATA.news || [];

  host.innerHTML = `
    <a class="wire__cell" href="${esc(latest.url || '#')}" target="_blank" rel="noopener">
      <div class="wire__head"><span class="wire__kind">01 / Release</span><span class="wire__time">${esc(dotted(latest.date))}</span></div>
      <div class="wire__sq" data-w-art></div>
      <p class="wire__title">${esc(tidy(latest.title || ''))}</p>
      <p class="wire__sub">${esc([latest.kind, latest.trackCount ? `${latest.trackCount} tracks` : ''].filter(Boolean).join(' · '))}</p>
    </a>

    ${vid ? `<a class="wire__cell" href="${esc(vid.url)}" target="_blank" rel="noopener">
      <div class="wire__head"><span class="wire__kind">02 / Stage</span><span class="wire__time">${esc(relative(vid.date))}</span></div>
      <div class="wire__sq" data-w-thumb><span class="scan" aria-hidden="true"></span></div>
      <p class="wire__title">${esc(vid.title)}</p>
      <p class="wire__sub">Straight off the channel.</p>
    </a>` : ''}

    <div class="wire__cell">
      <div class="wire__head"><span class="wire__kind">03 / Press</span><span class="wire__time">${esc(news[0] ? relative(news[0].date) : '')}</span></div>
      ${news.slice(0, 4).map((n) => `
        <a class="wire__press" href="${esc(n.url)}" target="_blank" rel="noopener">
          <span class="wire__press-t">${esc(n.title)}</span>
          <span class="wire__press-m">${esc([n.outlet, fmtDate(n.date, { month: 'short', day: '2-digit' })].filter(Boolean).join(' · '))}</span>
        </a>`).join('')}
    </div>`;

  const artHost = $('[data-w-art]', host);
  if (artHost) {
    const u = latest.artSmall || latest.art;
    artHost.innerHTML = u ? `<img alt="" loading="lazy">` : placeholder('Release art');
    setImg($('img', artHost), u);
  }
  const thumbHost = $('[data-w-thumb]', host);
  if (thumbHost && vid?.thumb) {
    thumbHost.insertAdjacentHTML('afterbegin', `<img alt="" loading="lazy">`);
    setImg($('img', thumbHost), vid.thumb);
  }
}

/* ─── lineup ─────────────────────────────────────────────────────────── */

function renderLineup() {
  const members = DATA.members || [];
  const checked = DATA.lineupCheck ? (DATA.generated || '').slice(0, 10) : null;

  const eyebrow = $('[data-lineup-eyebrow]');
  if (eyebrow) {
    eyebrow.textContent =
      `${members.length} members${checked ? ` · verified ${dotted(checked)}` : ''}`;
  }

  const ticker = $('[data-lineup-ticker]');
  if (ticker) {
    const names = members.map((m) => m.name.toUpperCase());
    ticker.innerHTML = [...names, ...names].map((n) => `<span>${esc(n)}</span>`).join('');
  }

  const grid = $('[data-members]');
  if (grid) {
    grid.innerHTML = members.map((m, i) => {
      const service = m.status === 'Service';
      return `
      <article class="mem">
        <i class="mem__b mem__b--tl" aria-hidden="true"></i>
        <i class="mem__b mem__b--br" aria-hidden="true"></i>
        <div class="mem__ph">
          <span class="mem__pos">${esc(m.position || '')}</span>
          ${m.leader ? `<span class="mem__lead">Leader</span>` : ''}
          ${m.photo
            ? `<img src="${esc(m.photo)}" alt="${esc(m.name)}" loading="lazy" decoding="async"
                    onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ph',textContent:'${esc(m.name)} photo'}))">`
            : placeholder(`${m.name} photo`)}
          <span class="mem__no">NO.${pad2(i + 1)}</span>
        </div>
        <div class="mem__body">
          <h3 class="mem__name">${esc(m.name)}</h3>
          <p class="mem__kr">${esc(m.hangul || '')}</p>
          <div class="mem__data">
            <p class="mem__row"><b>Born</b><span>${esc(fmtDate(m.born, { year: 'numeric', month: 'short', day: '2-digit' }))}</span></p>
            <p class="mem__row"><b>From</b><span>${esc(m.from || '')}</span></p>
            <p class="mem__row ${service ? 'is-service' : 'is-active'}"><b>Status</b><span>${esc(m.status || '')}</span></p>
          </div>
        </div>
      </article>`;
    }).join('');
  }

  const log = $('[data-lineup-log]');
  if (log) {
    log.innerHTML = (DATA.lineupLog || []).map((e) => `
      <li>
        <span class="log__d">${esc(fmtDate(e.date, { year: 'numeric', month: 'short' }))}</span>
        <span class="log__n">${esc(e.name)}</span>
        <span class="log__t">${esc(e.note || '')}</span>
        <span class="log__tag log__tag--${esc((e.tag || '').toLowerCase())}">${esc(e.tag || '')}</span>
      </li>`).join('');
  }
}

/* ─── redline ────────────────────────────────────────────────────────── */

function renderTour() {
  const tour = DATA.tour || {};
  const host = $('[data-tour]');
  if (!host) return;

  const eyebrow = $('[data-tour-eyebrow]');
  if (eyebrow) eyebrow.textContent = [tour.name, tour.subtitle].filter(Boolean).join(' · ');

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (tour.dates || [])
    .filter((d) => d.date && d.date >= today)
    .sort((a, b) => (a.date > b.date ? 1 : -1));

  const pending = (tour.pending || [])
    .map((p) => `<span class="chip chip--mag">${esc(p.city)}</span>`)
    .join('');

  const pendingRow = pending
    ? `<div class="pending"><span class="pending__l">Announced, no date yet</span>${pending}</div>`
    : '';

  if (!upcoming.length) {
    host.innerHTML = `
      <p class="empty">No dates on sale right now.</p>
      ${pendingRow}`;
    return;
  }

  host.innerHTML = `
    <ol class="dates">
      ${upcoming.map((d) => `
        <li>
          <span class="dates__d">
            <span class="dates__day">${esc(fmtDate(d.date, { day: '2-digit' }))}</span>
            <span class="dates__mon">${esc(fmtDate(d.date, { month: 'short' }))}</span>
            <span class="dates__yr">${esc(d.date.slice(0, 4))}</span>
          </span>
          <span class="dates__w">
            <span class="dates__city">${esc(d.city)}${d.country ? `, ${esc(d.country)}` : ''}</span>
            <span class="dates__ven">${esc([d.venue, d.note].filter(Boolean).join(' · '))}</span>
          </span>
          <span class="dates__st">${esc(d.status || '')}</span>
          ${d.url ? `<a class="dates__btn" href="${esc(d.url)}" target="_blank" rel="noopener">Tickets</a>` : ''}
        </li>`).join('')}
    </ol>
    ${pendingRow}`;
}

/* ─── discography ────────────────────────────────────────────────────── */

/**
 * One function owns visibility.
 *
 * Both the filter chips and the expander feed this and nothing else touches
 * the grid. When they each toggled `hidden` on their own they undid each
 * other — pick a filter, expand, pick another, and rows from the previous
 * filter stayed visible.
 */
function visibleReleases() {
  const all = (DATA.releases || []).filter(
    (r) => S.filter === 'All' || r.kind === S.filter
  );
  return { all, shown: S.disco ? all : all.slice(0, CAPS.disco) };
}

function renderDiscography() {
  const releases = DATA.releases || [];
  const count = $('[data-disco-count]');
  if (count) count.textContent = releases.length;

  // Only offer filters that actually match something.
  const kinds = ['All', ...['Album', 'Repackage', 'EP', 'Single', 'Remix', 'OST']
    .filter((k) => releases.some((r) => r.kind === k))];

  const chipHost = $('[data-disco-filters]');
  if (chipHost) {
    chipHost.innerHTML = kinds.map((k) =>
      `<button type="button" class="chip${k === S.filter ? ' is-on' : ''}" data-kind="${esc(k)}" aria-pressed="${k === S.filter}">${esc(k)}</button>`
    ).join('');
    $$('button', chipHost).forEach((b) => b.addEventListener('click', () => {
      S.filter = b.dataset.kind;
      S.disco = false;           // a new filter starts collapsed
      renderDiscography();
    }));
  }

  const { all, shown } = visibleReleases();
  const host = $('[data-disco]');
  if (host) {
    host.innerHTML = shown.map((r) => {
      const u = r.artSmall || r.art;
      return `
      <a class="card" href="${esc(r.url)}" target="_blank" rel="noopener">
        <div class="card__art">
          ${u ? `<img src="${esc(sized(u, 300))}" srcset="${esc(srcset(u, 220, 300, 440))}" sizes="(max-width: 640px) 46vw, 200px" alt="" loading="lazy">` : placeholder('Cover')}
          <span class="card__kind">${esc(r.kind || '')}</span>
        </div>
        <h3 class="card__t">${esc(tidy(r.title))}</h3>
        <p class="card__d">${esc(dotted(r.date))}</p>
      </a>`;
    }).join('');
  }

  renderMore('[data-disco-more]', all.length > CAPS.disco, S.disco,
    `Show all ${all.length}`, () => { S.disco = !S.disco; renderDiscography(); });
}

/** The four expanders differ only by label. */
function renderMore(sel, needed, open, openLabel, onClick) {
  const host = $(sel);
  if (!host) return;
  if (!needed) { host.innerHTML = ''; return; }
  host.innerHTML =
    `<button type="button" class="more__btn" aria-expanded="${open}">${esc(open ? 'Show less' : openLabel)} ⌄</button>` +
    `<span class="more__line" aria-hidden="true"></span>`;
  $('button', host).addEventListener('click', onClick);
}

/* ─── watch ──────────────────────────────────────────────────────────── */

function renderVideos() {
  const vids = DATA.videos || [];
  const shown = S.videos ? vids : vids.slice(0, CAPS.videos);
  const host = $('[data-videos]');
  if (host) {
    host.innerHTML = shown.map((v) => `
      <a class="card" href="${esc(v.url)}" target="_blank" rel="noopener">
        <div class="vid__art">
          ${v.thumb ? `<img src="${esc(v.thumb)}" alt="" loading="lazy">` : placeholder('Thumbnail')}
          <span class="vid__play" aria-hidden="true">▶</span>
        </div>
        <h3 class="vid__t">${esc(v.title)}</h3>
        <p class="card__d">${esc(dotted(v.date))}</p>
      </a>`).join('');
  }
  renderMore('[data-videos-more]', vids.length > CAPS.videos, S.videos,
    `Show all ${vids.length}`, () => { S.videos = !S.videos; renderVideos(); });
}

/* ─── news ───────────────────────────────────────────────────────────── */

function renderNews() {
  const news = DATA.news || [];
  const shown = S.news ? news.slice(0, 14) : news.slice(0, CAPS.news);
  const host = $('[data-news]');
  if (host) {
    host.innerHTML = shown.map((n) => `
      <li>
        <a href="${esc(n.url)}" target="_blank" rel="noopener">
          <span class="news__d">${esc(fmtDate(n.date, { month: 'short', day: '2-digit', year: '2-digit' }))}</span>
          <span class="news__h">${esc(n.title)}</span>
          <span class="news__o">${esc(n.outlet || '')}</span>
        </a>
      </li>`).join('');
  }
  renderMore('[data-news-more]', news.length > CAPS.news, S.news,
    'Show all 14', () => { S.news = !S.news; renderNews(); });
}

/* ─── timeline ───────────────────────────────────────────────────────── */

function renderTimeline() {
  const items = [...(DATA.timeline || [])].reverse(); // newest first
  const shown = S.timeline ? items : items.slice(0, CAPS.timeline);
  const host = $('[data-timeline]');
  if (host) {
    host.innerHTML = shown.map((t) => `
      <li>
        <span class="tl__y">${esc(t.year || (t.date || '').slice(0, 4))}</span>
        <div class="tl__b">
          <h3 class="tl__t">${esc(t.title)}</h3>
          <p class="tl__x">${esc(t.body)}</p>
          ${t.tag ? `<span class="tl__tag">${esc(t.tag)}</span>` : ''}
        </div>
      </li>`).join('');
  }
  renderMore('[data-timeline-more]', items.length > CAPS.timeline, S.timeline,
    `Show all ${items.length}`, () => { S.timeline = !S.timeline; renderTimeline(); });
}

/* ─── facts ──────────────────────────────────────────────────────────── */

function renderFacts() {
  const facts = DATA.facts || [];
  if (!facts.length) return;

  const q = $('[data-fact]');
  const n = $('[data-fact-count]');

  const paint = () => {
    // Modulo at read time, so the index can run negative without clamping.
    const i = ((S.fact % facts.length) + facts.length) % facts.length;
    if (q) q.textContent = facts[i];
    if (n) n.textContent = `${pad2(i + 1)} / ${pad2(facts.length)}`;
  };

  $('[data-fact-prev]')?.addEventListener('click', () => { S.fact -= 1; paint(); });
  $('[data-fact-next]')?.addEventListener('click', () => { S.fact += 1; paint(); });
  paint();
}

/* ─── footer ─────────────────────────────────────────────────────────── */

function renderFooter() {
  const host = $('[data-links]');
  if (!host) return;
  host.innerHTML = (DATA.links || [])
    .map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`)
    .join('');
}

/* ─── active nav ─────────────────────────────────────────────────────── */

function initActiveNav() {
  if (!('IntersectionObserver' in window)) return;
  const links = $$('.hdr__nav a');
  if (!links.length) return;

  const io = new IntersectionObserver((entries) => {
    const vis = entries
      .filter((e) => e.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!vis) return;
    links.forEach((a) => a.classList.toggle('is-on', a.getAttribute('href') === `#${vis.target.id}`));
  }, { rootMargin: '-45% 0px -50% 0px' });

  links.forEach((a) => {
    const el = document.querySelector(a.getAttribute('href'));
    if (el) io.observe(el);
  });
}

boot();
