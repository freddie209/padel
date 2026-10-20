# Padel tournament app

A single-file PWA for running a round-robin padel tournament where **every pair
of players partners together exactly once**. Enter the players, build a
schedule, record scores with two taps per game, read the table.

## Architecture

Deliberately dependency-free. No build step, no framework, no backend.

```
index.html    the entire app — markup, CSS and JS in one file
manifest.json PWA manifest (name, icons, standalone display)
sw.js         service worker, cache-first, so it runs with no signal
icon-*.png    home screen icons (180 Apple touch, 192, 512 incl. maskable)
test.js       node test harness — runs the real code out of index.html
```

State lives in two `localStorage` keys, both per-device:

- `padel-tournament-v2` — the live tournament `{players, rounds, extras, results, countBest}`
- `padel-names-v2` — the last player list and starred index, so setup is prefilled next time

There is no sync. One person scores. If the shape of the stored object ever
changes, bump the key suffix rather than migrating.

Rendering is a full re-render into `#app` on every interaction, with a single
delegated `click` listener reading `data-act`. It is fast enough at this size;
don't reach for a framework. The one exception is `refreshSummary()`, which
patches the setup summary on `input` so the page doesn't re-render (and steal
focus) while you're typing a name.

## The two rules that matter

Both are easy to break by accident. `test.js` guards both.

**1. Every pair partners exactly once.** With `n` players there are
`n(n-1)/2` possible pairs. Each game consumes two pairs, so when the pair count
is odd one pair has to play together twice and those two players get an extra
game. That happens at n = 6, 7, 10, 11, 14… The starred player (`priority` in
setup) is **always** one of the two; the partner is drawn at random on each
build.

`buildSchedule(n, priority)` does this in three stages:
- enumerate all pairs, append the duplicate pair if the count is odd
- `matchPairs()` greedily pairs up pairs into games with no player on both
  sides, retrying up to 800 times with a reshuffle (most-constrained-first, so
  it rarely needs more than one attempt)
- `orderOnce()` sequences the games to spread the bench, scored 300 times and
  the best kept — the cost is quadratic in consecutive benched games, so nobody
  sits out twice running when it can be avoided

**2. Ranking is best-N totals, not averages.** `countBest` is the number of
games *most* players get (`min` of games played). Every player is ranked on the
sum of their best `countBest` scores. The two with an extra game simply have
their lowest score dropped, which is shown in their row. Freddie asked for this
specifically — **do not reintroduce averages.** Ties break on games won.

## Testing

```bash
node test.js
```

Runs with no dependencies. It extracts the `<script>` from `index.html` and
executes it in a `vm` sandbox with a stub DOM and localStorage, so it tests the
shipped code rather than a copy. It checks pair coverage, game counts, that the
starred player always gets the extra game, bench runs, and the best-N scoring
including the drop.

Add a case here before changing the generator or the scoring.

## Deploying

Static hosting, any provider. Drag the folder onto app.netlify.com/drop, or
push to GitHub and turn on Pages (Settings → Pages → deploy from branch, root).

Installing to a home screen needs a real URL — iOS won't install from a file.
On iPhone it must be Safari: Share → Add to Home Screen. Android Chrome:
menu → Install app.

**After changing `index.html`, bump `CACHE` in `sw.js`** (`padel-v1` → `v2`…).
The service worker is cache-first, so without a bump an installed copy keeps
serving the old version.

## Conventions

- British English in UI copy.
- Palette is court-derived and lives in `:root`: deep `#062A2B`, court
  `#0C4341`, tile `#125B57`, line `#EDF2EE`, ball `#DDF247`. The yellow is the
  single accent — it marks the live game, the leader, and the primary action,
  and nothing else.
- Type is Archivo (display/UI) and DM Mono (numbers, labels, metadata). All
  numerals are `font-variant-numeric: tabular-nums` so scores don't jitter.
- Touch targets stay at 38px and up.
