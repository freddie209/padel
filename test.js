/*
 * Tests for the padel schedule generator and scoring.
 * Run:  node test.js
 *
 * No dependencies. It pulls the <script> out of index.html and runs it in a
 * sandbox with fake localStorage/DOM, so it tests the real shipped code
 * rather than a copy that can drift out of date.
 */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const src = html.match(/<script>([\s\S]*)<\/script>/)[1];

const stubEl = {
  addEventListener() {},
  querySelectorAll() { return []; },
  querySelector() { return { focus() {} }; },
  set innerHTML(v) { this._h = v; },
  get innerHTML() { return this._h || ""; }
};
const store = {};
const ctx = {
  console,
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  },
  document: { getElementById: () => stubEl, addEventListener() {} },
  window: { addEventListener() {}, scrollTo() {} },
  navigator: {},
  alert: m => { throw new Error("alert: " + m); },
  setTimeout, clearTimeout, Math, JSON, Set, Array, Object, String, Number
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx);

// `T` is a `let` in the script's own scope, so reach it through the context
const setT = o => vm.runInContext("T = " + JSON.stringify(o), ctx);
const setResults = r => vm.runInContext("T.results = " + JSON.stringify(r), ctx);
const table = () => vm.runInContext("JSON.parse(JSON.stringify(standings()))", ctx);

let pass = true;
const check = (ok, msg) => { if (!ok) { pass = false; console.log("  FAIL: " + msg); } };

const POOL = ["Freddie", "Alex", "Cisco", "Barnaby", "Antonio", "Georgie",
              "Hugo", "Ivo", "Jonty", "Kit", "Louis", "Milo", "Ned", "Otto"];

/* ---------- 1. schedule invariants, 4 to 14 players ---------- */
console.log("Schedule generation (Freddie starred, index 0)\n");

for (let n = 4; n <= 14; n++) {
  const players = POOL.slice(0, n);
  const built = ctx.buildSchedule(n, 0);
  check(!!built, `N=${n} built a schedule`);
  if (!built) continue;

  // --- every pair partners exactly once (the extra pair twice) ---
  const seen = {};
  built.rounds.forEach(g => g.forEach(p => {
    const k = p[0] + "-" + p[1];
    seen[k] = (seen[k] || 0) + 1;
  }));
  let expectedPairs = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    expectedPairs++;
    const k = i + "-" + j;
    const isExtra = built.extras &&
      Math.min(...built.extras) === i && Math.max(...built.extras) === j;
    check(seen[k] === (isExtra ? 2 : 1),
      `N=${n} pair ${players[i]}+${players[j]} appears ${seen[k]}x, expected ${isExtra ? 2 : 1}`);
  }
  check(Object.keys(seen).length === expectedPairs, `N=${n} no pairings invented`);

  // --- four distinct players per game ---
  built.rounds.forEach((g, i) =>
    check(new Set([...g[0], ...g[1]]).size === 4, `N=${n} game ${i + 1} has a duplicate player`));

  // --- games per player, and the starred player gets any extra ---
  const gp = new Array(n).fill(0);
  built.rounds.forEach(g => [...g[0], ...g[1]].forEach(p => gp[p]++));
  const lo = Math.min(...gp), hi = Math.max(...gp);
  if (built.extras) {
    check(built.extras.includes(0), `N=${n} starred player is in the extra pair`);
    check(hi - lo === 1, `N=${n} spread should be exactly 1, got ${hi - lo}`);
    built.extras.forEach(p => check(gp[p] === hi, `N=${n} ${players[p]} should have the most games`));
    check(gp.filter(x => x === hi).length === 2, `N=${n} exactly two players get the extra`);
  } else {
    check(hi === lo, `N=${n} everyone should play the same number, got ${lo}-${hi}`);
  }

  // --- nobody benched too many games running ---
  const run = new Array(n).fill(0);
  let worstRun = 0;
  built.rounds.forEach(g => {
    const on = new Set([...g[0], ...g[1]]);
    for (let p = 0; p < n; p++) {
      if (on.has(p)) run[p] = 0;
      else { run[p]++; worstRun = Math.max(worstRun, run[p]); }
    }
  });
  // with n players only 4 are on court, so some bench runs are unavoidable
  const benchFloor = Math.max(0, Math.ceil((n - 4) / 4));
  check(worstRun <= Math.max(1, benchFloor) + 2,
    `N=${n} worst bench run ${worstRun} looks too long`);

  const extraNames = built.extras ? built.extras.map(i => players[i]).join(" + ") : "none";
  console.log(`  N=${String(n).padStart(2)}  ${String(built.rounds.length).padStart(2)} games  ` +
              `best-${lo} counts  max bench run ${worstRun}  extra game: ${extraNames}`);
}

/* ---------- 2. scoring: best-N, worst dropped, no averages ---------- */
console.log("\nScoring (6 players, Freddie starred)");

const built = ctx.buildSchedule(6, 0);
const gp = new Array(6).fill(0);
built.rounds.forEach(g => [...g[0], ...g[1]].forEach(p => gp[p]++));
const countBest = Math.min(...gp);
const players6 = POOL.slice(0, 6);

setT({ players: players6, rounds: built.rounds, extras: built.extras, results: {}, countBest });

// baseline: everyone else gets a flat 3
const res = {};
built.rounds.forEach((g, i) => { res[i] = { a: 3, b: 3 }; });

// give Freddie (index 0) known scores across his six games
const mine = built.rounds
  .map((g, i) => ({ i, side: g[0].includes(0) ? "a" : (g[1].includes(0) ? "b" : null) }))
  .filter(x => x.side);
check(mine.length === countBest + 1, `Freddie should play ${countBest + 1} games, got ${mine.length}`);

const vals = [9, 8, 7, 6, 5, 1];
mine.forEach((x, k) => { res[x.i] = x.side === "a" ? { a: vals[k], b: 3 } : { a: 3, b: vals[k] }; });
setResults(res);

const fred = table().find(r => r.name === "Freddie");
console.log(`  Freddie's six scores: ${vals.join(", ")}`);
console.log(`  counted total ${fred.total} (expect 35)   dropped ${fred.dropped.join(",")} (expect 1)`);
check(fred.total === 35, "best-5 total should be 9+8+7+6+5 = 35");
check(fred.dropped.length === 1 && fred.dropped[0] === 1, "the single dropped score should be the lowest");
check(fred.played === countBest + 1, "played count should include the extra game");

// a non-extra player drops nothing
const other = table().find(r => !r.extra);
check(other.dropped.length === 0, `${other.name} plays the base number and should drop nothing`);
check(other.played === countBest, `${other.name} should have played ${countBest}`);

// table is sorted by total, descending
const tbl = table();
for (let i = 1; i < tbl.length; i++) {
  check(tbl[i - 1].total >= tbl[i].total, "table should be sorted by total, descending");
}

// a partial tournament must not crash or drop early
setResults({ 0: { a: 9, b: 4 } });
const partial = table();
check(partial.length === 6, "every player should appear before all games are played");
check(partial.every(r => r.dropped.length === 0), "nothing should be dropped mid-tournament");

console.log(pass ? "\nALL CHECKS PASSED" : "\nFAILURES FOUND");
process.exit(pass ? 0 : 1);
