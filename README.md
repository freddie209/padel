# Padel

A tournament app for padel where **everyone partners everyone**. Enter the
players, build a schedule, tap in the scores, read the table. Works on a phone
home screen and with no signal.

![icon](icon-192.png)

## Running it

Open `index.html` in a browser. That's the whole app — there is no build step
and nothing to install.

## Putting it on a phone

iOS won't install a web app from a file, so it needs to be on a URL first.

1. Drag this folder onto [app.netlify.com/drop](https://app.netlify.com/drop) —
   the folder itself, not the files inside it. You get a URL in seconds, free.
   (Or push to GitHub and turn on Pages: Settings → Pages → deploy from branch, root.)
2. Open that URL on your phone. **iPhone must use Safari** — Chrome on iOS
   can't install web apps.
3. iPhone: Share → Add to Home Screen. Android: Chrome menu → Install app.

It then opens full screen with its own icon and works offline.

## How the tournament works

Every possible pair of players partners together exactly once.

With six players there are 15 possible pairings — an odd number, so one pair
has to play together twice and those two get an extra game. The same happens at
7, 10, 11 and 14 players. The starred player on the setup screen is always one
of them; the other is drawn at random each time you build a schedule. At 4, 5,
8, 9 and 12 players it divides evenly and nobody needs an extra.

Games add up fast: 6 players is 8 games, 10 is 23, 12 is 33. The setup screen
shows the count and a rough time as you type.

## Scoring

Games are first to 9. Tap the pair that won, then tap how many the losers got.

Ranking is on **total points from your best N games**, where N is what most
players get — no averages. The two with an extra game have their lowest score
dropped, and the table shows which one went. Ties break on games won.

## Development

```bash
node test.js    # no dependencies
```

See `CLAUDE.md` for the architecture and the invariants the tests protect.

After editing `index.html`, bump `CACHE` in `sw.js` or installed copies will
keep serving the old version.
