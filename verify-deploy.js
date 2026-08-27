/**
 * NCT 127 — deployed-content check.
 *
 * Confirms that what GitHub Pages is actually serving matches what is in the
 * repository. Run on a schedule, half an hour behind the data updater.
 *
 * This exists because of a real failure: a Pages deploy timed out in its
 * "updating_pages" phase and aborted, and the site simply went on serving the
 * previous build. Nothing was down, nothing 404'd, no workflow of ours failed
 * — the site was just quietly four hours stale, and the only signal was an
 * email about a workflow nobody owns. A stalled deploy should be loud.
 *
 * Compares a sha256 of each tracked file against the same file fetched live.
 * Any mismatch fails the job, which is what sends the notification.
 *
 *   node verify-deploy.js
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

/* The four files that carry everything a deploy can get wrong: content, data,
   styling and behaviour. index.html and data/site.json are rewritten by the
   updater; the other two only change when someone edits them — which is
   exactly the case that failed silently. */
const FILES = ['index.html', 'data/site.json', 'assets/css/style.css', 'assets/js/app.js'];

/* Pages serves with max-age=600, and a stale edge copy would read as a failed
   deploy. A unique query string is a different cache key, so this always gets
   the origin's current bytes. */
const bust = (url) => `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}${Math.random()}`;

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);

const log = {
  ok: (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`),
  bad: (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`),
  step: (m) => console.log(`\n\x1b[1m${m}\x1b[0m`),
};

async function siteUrl() {
  const curated = JSON.parse(await fs.readFile(path.join(ROOT, 'content', 'curated.json'), 'utf8'));
  return (curated.siteUrl || '').replace(/\/+$/, '');
}

async function check(base, rel) {
  const local = await fs.readFile(path.join(ROOT, rel));
  const res = await fetch(bust(`${base}/${rel}`), {
    headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'nct-127-DeployCheck/1.0' },
  });
  if (!res.ok) return { rel, ok: false, why: `HTTP ${res.status}` };

  const live = Buffer.from(await res.arrayBuffer());
  const a = sha(local);
  const b = sha(live);
  return a === b
    ? { rel, ok: true, why: `${a}` }
    : { rel, ok: false, why: `repo ${a} (${local.length}B) vs live ${b} (${live.length}B)` };
}

async function main() {
  const base = await siteUrl();
  if (!base) {
    console.error('No siteUrl in content/curated.json — nothing to check against.');
    process.exit(1);
  }

  log.step(`Checking ${base}`);

  /* A push that lands just before this runs may still be mid-deploy, so a
     mismatch is retried before it is believed. Four tries over ~6 minutes
     clears a normal deploy (usually well under a minute) without masking a
     genuinely stalled one, which stays broken for hours.
     DEPLOY_CHECK_WAIT_MS shortens the wait so the failure path can be tested. */
  let results = [];
  for (let attempt = 1; attempt <= 4; attempt++) {
    results = await Promise.all(FILES.map((f) => check(base, f)));
    if (results.every((r) => r.ok)) break;
    if (attempt < 4) {
      log.step(`Mismatch on attempt ${attempt} — deploy may still be running, waiting 2m`);
      for (const r of results) (r.ok ? log.ok : log.bad)(`${r.rel} — ${r.why}`);
      await new Promise((r) => setTimeout(r, Number(process.env.DEPLOY_CHECK_WAIT_MS ?? 120000)));
    }
  }

  log.step('Result');
  for (const r of results) (r.ok ? log.ok : log.bad)(`${r.rel} — ${r.why}`);

  const stale = results.filter((r) => !r.ok);
  if (!stale.length) {
    log.ok('deployed content matches the repository');
    return;
  }

  console.log(
    `\n\x1b[31mDeployed content is stale.\x1b[0m ${stale.length} of ${FILES.length} files ` +
    `served by ${base} do not match this commit.\n\n` +
    `The site is up — it is serving an older build. This is usually a Pages\n` +
    `deploy that stalled rather than anything wrong with the repo. Re-run the\n` +
    `most recent "pages build and deployment" run from the Actions tab, or:\n\n` +
    `  gh run rerun <run-id> --failed\n`
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(`Check could not run: ${err.message}`);
  process.exit(1);
});
