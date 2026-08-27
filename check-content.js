/**
 * Content sanity check.
 *
 * verify-deploy.js answers "is the site serving what the repo says?".
 * This answers the different question: "does what the repo says still make
 * sense?" Both can be green while the page is wrong — a countdown sat on
 * 00:00:00 for four days after the album it counted to had already come
 * out, and every file matched, every workflow passed.
 *
 * Deliberately a DATA check, not a rendering one. These pages build
 * themselves from data/site.json in the browser, so the served HTML is an
 * empty shell and there is no headless browser here to run the JS — adding
 * one would be the first dependency in the project. So the rules below are
 * the render's assumptions written as assertions about the data: if the
 * data cannot produce a nonsense page, the page is not nonsense. What this
 * cannot catch is a bug purely in rendering logic, with sane data behind
 * it. That is the honest limit of it.
 *
 * Every check is guarded on the key existing, so one file serves all three
 * sites and simply skips what a given site does not have.
 *
 *   node check-content.js
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

const log = {
  ok: (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`),
  bad: (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`),
  skip: (m) => console.log(`  \x1b[90m·\x1b[0m ${m}`),
  step: (m) => console.log(`\n\x1b[1m${m}\x1b[0m`),
};

const problems = [];
const fail = (m) => problems.push(m);

const DAY = 864e5;
const days = (iso) => (Date.now() - new Date(iso).getTime()) / DAY;

async function main() {
  const site = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'site.json'), 'utf8'));
  const checks = [];
  const run = (name, fn) => {
    const skipped = fn();
    checks.push([name, skipped]);
  };

  log.step('Content sanity');

  /* A drop whose date has passed should have turned into a real catalogue
     entry within a few days. Longer than that means either the release
     slipped and curated.json needs a new date, or the catalogue sources
     are not finding it — and until one of those is true the hero is
     advertising something that does not exist. */
  run('pending drop resolved', () => {
    if (!site.drop?.date) return 'no drop configured';
    const late = days(site.drop.date);
    if (late > 3 && !site.drop.release) {
      fail(`drop "${site.drop.title}" was due ${Math.floor(late)} days ago and still has no catalogue entry`);
    }
    return false;
  });

  /* The K-POP ScreaM bug: a remix compilation outranked the real album and
     became the headline release, because it was newer. */
  run('headline release is a real release', () => {
    if (!site.latest) return 'no latest release';
    if (/^(Remix|OST)$/i.test(site.latest.kind || '')) {
      fail(`headline release "${site.latest.title}" is classified ${site.latest.kind}`);
    }
    if (site.latest.date && days(site.latest.date) < -2) {
      fail(`headline release "${site.latest.title}" is dated in the future (${site.latest.date})`);
    }
    return false;
  });

  /* Counts shown in the hero are computed at build time; if they drift from
     the arrays they describe, the page states a number it cannot back up. */
  run('stated counts match the data', () => {
    if (!site.stats) return 'no stats block';
    if (site.stats.releaseCount != null && site.stats.releaseCount !== (site.releases || []).length) {
      fail(`stats.releaseCount is ${site.stats.releaseCount} but releases[] holds ${(site.releases || []).length}`);
    }
    return false;
  });

  /* Sections that should never be empty. An empty one is not a crash — the
     page renders a tidy blank — which is exactly why it goes unnoticed. */
  run('core sections populated', () => {
    for (const key of ['releases', 'videos', 'news']) {
      if (Array.isArray(site[key]) && site[key].length === 0) fail(`${key}[] is empty`);
    }
    for (const key of ['members', 'eras']) {
      if (Array.isArray(site[key]) && site[key].length === 0) fail(`${key}[] is empty`);
    }
    return false;
  });

  /* Every announced show should be in the future or recent. A list whose
     newest entry is long past means the page is quietly showing "no dates"
     while the artist is in fact touring. */
  run('tour dates not wholly stale', () => {
    const dates = (site.tour?.dates || []).map((d) => d.date).filter(Boolean).sort();
    if (!dates.length) return 'no tour dates listed';
    const newest = dates[dates.length - 1];
    if (days(newest) > 120) {
      fail(`newest tour date is ${newest}, ${Math.floor(days(newest))} days ago — the Live section is showing nothing`);
    }
    return false;
  });

  /* Anything the render will print or link. A stringified undefined in a
     URL is a dead link; in a title it is visible nonsense.

     Scanned per value rather than over the whole blob: Google News wraps
     each article id in base64, and base64 of ordinary text throws up
     "NaN" often enough that a blob-wide search reported a problem on a
     perfectly healthy file. A check that cries wolf gets ignored, which
     is worse than not having it. */
  run('no placeholder values leaked', () => {
    const hits = [];
    const walk = (v, key = '') => {
      if (typeof v === 'string') {
        if (/^https?:\/\//.test(v)) {
          // opaque ids live in URLs; only a placeholder path segment matters
          if (/\/(undefined|null|NaN)(\/|\?|$)/.test(v)) hits.push(`${key}: ${v.slice(0, 60)}`);
        } else if (/\b(undefined|NaN)\b/.test(v) || v === 'null') {
          hits.push(`${key}: "${v.slice(0, 50)}"`);
        }
      } else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k);
    };
    walk(site);
    if (hits.length) fail(`${hits.length} placeholder value(s), e.g. ${hits[0]}`);
    return false;
  });

  /* Images are hotlinked from source CDNs, so a malformed URL is a broken
     image on someone else's schedule, not ours. */
  run('image URLs well formed', () => {
    const urls = [];
    const walk = (v) => {
      if (typeof v === 'string' && /^https?:\/\//.test(v) && /\.(jpg|jpeg|png|webp|avif)/i.test(v)) urls.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(site);
    if (!urls.length) return 'no remote images';
    const broken = urls.filter((u) => !/^https:\/\//.test(u) || /\s/.test(u));
    if (broken.length) fail(`${broken.length} image URL(s) malformed, e.g. ${broken[0].slice(0, 70)}`);
    return false;
  });

  /* The world tour's summary sentence is generated from the stops; if the
     two disagree the page contradicts itself in the same section. */
  run('world tour summary matches its stops', () => {
    const wt = site.worldTour;
    if (!wt?.legs) return 'no world tour';
    const stops = wt.legs.flatMap((l) => l.cities || []);
    if (wt.stats && wt.stats.cities !== stops.length) {
      fail(`worldTour.stats says ${wt.stats.cities} cities, legs hold ${stops.length}`);
    }
    const dated = stops.filter((s) => s.date).length;
    if (wt.stats && wt.stats.dated !== dated) {
      fail(`worldTour.stats says ${wt.stats.dated} dated stops, found ${dated}`);
    }
    return false;
  });

  for (const [name, skipped] of checks) {
    if (skipped) log.skip(`${name} — ${skipped}`);
  }

  log.step('Result');
  if (!problems.length) {
    log.ok(`${checks.filter(([, s]) => !s).length} checks passed, nothing looks wrong`);
    return;
  }
  problems.forEach((p) => log.bad(p));
  console.log(
    `\n\x1b[31m${problems.length} content problem(s).\x1b[0m The site is up and ` +
    `serving what the repo holds — the content itself has gone stale or\n` +
    `self-contradictory. Most of these are fixed in content/curated.json.\n`
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(`Check could not run: ${err.message}`);
  process.exit(1);
});
