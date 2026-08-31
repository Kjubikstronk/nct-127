# NCT 127

An NCT 127 fan site that keeps itself current. Discography, lineup, videos and news
refresh on a schedule without anyone touching the repo.

**[kjubikstronk.github.io/nct-127](https://kjubikstronk.github.io/nct-127/)**

## How it works

`build.js` is plain Node with native fetch. No dependencies, no API keys, no build
step beyond running the file. It hits five public sources, merges what comes back and
writes `data/site.json`, which the page reads:

| Source | Used for |
|---|---|
| iTunes | releases and artwork |
| Deezer | cross-check on the discography |
| YouTube | latest videos |
| MusicBrainz | release metadata |
| Wikipedia | lineup and biography |

All five were verified live before any of the UI existed. That order came from the
previous build in this family, where checking the ids first turned out to be cheaper
than discovering a wrong one after the CSS was written.

The one design rule is that a source being down must never blank a section. Every
fetch is wrapped, and anything that fails falls back to whatever is already on disk.
A site that quietly loses its video list because YouTube rate-limited a scheduled run
is worse than a site showing yesterday's videos.

## The schedule

A GitHub Action runs `build.js` every six hours and commits the result only if
something actually moved.

```yaml
- cron: '17 */6 * * *'
```

The `:17` is deliberate. GitHub's scheduler is best-effort and queues hardest on the
hour, where every cron in the world piles up. Running on the hour drifted between 45
minutes and nearly 3 hours late. An odd minute gets picked up close to on time.

Six hours suits the subject: Korean releases usually land around 09:00 UTC, so a new
drop appears within a few hours without hammering the sources.

`build.js` leaves files untouched when nothing substantive changed, so an empty diff
genuinely means there was no news, and the repo does not fill up with noise commits.

## Running it

```bash
node build.js     # refresh data/site.json
```

Node 18 or newer, for native fetch. Then open `index.html`.
