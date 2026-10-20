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

- `padel-tournament-v2` — the live tournament `{players, rounds, extras, results, countBest, format, genders, star, starts, final, courts, slot, target, limitGames, limit, ranking, left}` (everything after `countBest` is optional, so older saves still load)
- `padel-names-v2` — the last player list, starred index and genders, so setup is prefilled next time

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

**Formats** (the `Format` button at the top of setup; `FORMATS` in the script).
Default is `any` — anyone with anyone, gender ignored. The format is not saved,
so every visit starts on `any`. The other two show a Boy/Girl button per player
(genders *are* saved) and need at least two of each:
- `mixed` — only boy+girl pairs, so every game is boy+girl v boy+girl. Every
  boy partners every girl once; same-sex pairs never play.
- `same` — a game is always two pairs of the same kind: boy+girl v boy+girl,
  boy+boy v boy+boy, girl+girl v girl+girl. Never mixed against same-sex.

`pairGroups(n, genders, sameSex)` splits the pairs into kinds and
`buildSchedule` matches each kind on its own, so each odd-sized kind gets its
own doubled pair (up to three; never two extras for one player, starred player
first if they're in that kind). A same-sex kind needs four of that sex, so
with two or three boys (or girls) those pairs are left out. Game counts can
differ by sex in both formats; best-N absorbs it. `mixedSummaryHTML()` mirrors
`pairGroups()` — keep them in step.

**Courts** (1–4 picker on setup, saved; capped at players ÷ 4): games are
packed into time slots of up to that many games with nobody on two courts.
`T.rounds` stays a flat list; `T.slot[i]` is game i's slot (older saves have
none — one game per slot). On several courts `buildSchedule` tries 150
groupings of pairs into games, alternating random `matchPairs` with
`factorGames` (textbook circle-method / rotation matchings), and packs each
with the greedy `slotOnce` and first-fit `slotInOrder`. `benchScore` ranks
fewest slots first, then bench runs. Part-full slots go last. Almost every
case hits the minimum number of slots; `test.js` prints used/minimum.

**Points to win** (`points`, −/+ on setup, 3–21, saved; stored as
`T.target`): scoring chips, the winners' default and the eyebrow all follow
it. Minutes per game scale with it (`minsPerGame`, 12 min at first to 9).

**Court time** (`limit`, the Court time button beside Format; not saved, so
every visit starts with none). `needsCut(n)` compares `fullMins(n)` — the
full schedule's slots × minutes per game — with the limit. If it won't fit,
`limitedPlan(n)` picks the most games each `k` with `n·k/4` a whole number of
games that fits, so everyone plays exactly `k`; otherwise it fills the time
and some play one fewer (best-N absorbs it). `buildLimited` then builds that
many games slot by slot, least-played first, preferring new partnerships —
partners vary but not every pair plays together. `T.limitGames` makes
another round add another limited block, avoiding partners already used.
`fitPoints(n)` offers a lower points target that would fit the full
schedule, shown as a button in the summary.

**Another round** (`addRound()`, button at the bottom of Rounds, tap twice):
builds the same format afresh and appends it, recording where it starts in
`T.starts`, so everyone's count rises together and best-N stays fair.
`countBest` is recomputed. `T.star` and `T.genders` are kept on the
tournament so it can rebuild.

**Final** (`pickFinal()`, offered once every game has a score): optional, just
for fun, stored in `T.final` and never counted in the table. Anyone: 1st + 4th
v 2nd + 3rd. Mixed formats: top boy + 2nd girl v 2nd boy + top girl. Adding a
round or clearing scores removes it.

**2. Ranking is chosen per tournament (`T.ranking`), average by default.**
Freddie asked for this (Oct 2026): a small "Rank the table by" switch on
setup, **Average** selected unless changed, never a forced choice.
- `avg` — average points per game. The table shows plain totals while
  everyone has played the same number, and averages (one decimal) once
  they differ. Added games and edits make counts uneven, which is why it's
  the default.
- `best` — the original rule: everyone ranked on the sum of their best
  `countBest` games (`min` of games played among active players); anyone
  with more has their lowest scores dropped, shown in their row.
Saves from before this have no `ranking` and stay on `best`. Ties break on
games won.

**Add a game** (`addGame()`): one game per court for spare time at the end.
`localSpace()` maps active players to 0..m−1 with their games so far
(counted from whole games, so a partner who has left still counts) and
slots since last on court; `buildLimited(..., start)` carries on from there.

**Editing** (`Edit` on the tournament screen → `startEdit()`): the setup
screen opens filled from the tournament, `editFrom[i]` tying each row to a
player index (−1 = new). With no scores yet, saving just builds afresh.
Otherwise `saveEdit()` keeps every scored game and its result, renames in
place, appends new players, and marks removed ones in `T.left` (their past
games stand, they leave the table and new games). New/removed players,
boy/girl or format, court time, or points under a court time →
`rebuildUnplayed(true)` rebuilds the unplayed games with `buildLimited`
(enough for the unplayed partnerships, or what's left of the court time);
courts alone → the same unplayed games re-packed. "Back without changing
anything" restores the setup screen from `editSnap`.

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

Live at https://freddie209.github.io/padel/ (GitHub Pages, `master`, root).
Push to `master` to deploy.

**After changing `index.html`, bump `CACHE` in `sw.js`** (`padel-v5` → `v6`…).
The service worker is cache-first, so without a bump an installed copy keeps
serving the old version. With a bump, the new worker installs in the
background on the next open and the page reloads itself once
(`controllerchange`), so people see the update within seconds of opening.
Copies from before `padel-v3` lack that reload and need a second open.

## Conventions

- British English in UI copy.
- Palette is court-derived and lives in `:root`: deep `#062A2B`, court
  `#0C4341`, tile `#125B57`, line `#EDF2EE`, ball `#DDF247`. The yellow is the
  single accent — it marks the live game, the leader, and the primary action,
  and nothing else.
- Type is Archivo (display/UI) and DM Mono (numbers, labels, metadata). All
  numerals are `font-variant-numeric: tabular-nums` so scores don't jitter.
- Touch targets stay at 38px and up.
