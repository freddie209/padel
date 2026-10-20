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

/* ---------- 1b. mixed: games are always like against like ---------- */
const kind = (p, sx) => sx[p[0]] !== sx[p[1]] ? "mf" : sx[p[0]] + sx[p[0]];
for (const sameSex of [false, true]) {
console.log(`\n${sameSex ? "Mixed + same-sex" : "Mixed only"} (2-8 boys x 2-8 girls, genders shuffled, index 0 starred)\n`);
for (let m = 2; m <= 8; m++) for (let f = 2; f <= 8; f++) {
  const n = m + f, tag = `${sameSex ? "same" : "mixed"} ${m}b+${f}g`;
  for (let rep = 0; rep < 3; rep++) {
    const sx = [...Array(m).fill("m"), ...Array(f).fill("f")].sort(() => Math.random() - 0.5);
    const built = ctx.buildSchedule(n, 0, sx, sameSex);
    check(!!built, `${tag} built a schedule`);
    if (!built) continue;

    // both sides of every game are the same kind of pair
    built.rounds.forEach((g, i) => {
      check(kind(g[0], sx) === kind(g[1], sx), `${tag} game ${i + 1} is ${kind(g[0], sx)} v ${kind(g[1], sx)}`);
      check(new Set([...g[0], ...g[1]]).size === 4, `${tag} game ${i + 1} has a duplicate player`);
    });

    // every playable pair once, doubled pairs twice, unplayable same-sex pairs never
    const seen = {};
    built.rounds.forEach(g => g.forEach(p => { const k = p[0] + "-" + p[1]; seen[k] = (seen[k] || 0) + 1; }));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const k = kind([i, j], sx);
      const playable = k === "mf" || (sameSex && (k === "mm" ? m : f) >= 4);
      const times = built.doubled.filter(d => d[0] === i && d[1] === j).length;
      check((seen[i + "-" + j] || 0) === (playable ? 1 + times : 0),
        `${tag} pair ${i}+${j} (${k}) appears ${seen[i + "-" + j] || 0}x`);
    }

    // nobody gets two extras, and the star gets one if their kind of pairing is odd
    const ex = built.extras || [];
    check(ex.length === new Set(ex).size, `${tag} someone got two extra games`);
    const mm = m * (m - 1) / 2, ff = f * (f - 1) / 2;
    const starOdd = (m * f) % 2 === 1 || (sameSex && (sx[0] === "m" ? m >= 4 && mm % 2 : f >= 4 && ff % 2));
    check(!starOdd || ex.includes(0), `${tag} starred player should have an extra game`);

    if (rep === 0) {
      const gp = new Array(n).fill(0);
      built.rounds.forEach(g => [...g[0], ...g[1]].forEach(p => gp[p]++));
      console.log(`  ${tag.padEnd(12)} ${String(built.rounds.length).padStart(2)} games  ` +
                  `games each ${Math.min(...gp)}-${Math.max(...gp)}  doubled pairs ${built.doubled.length}`);
    }
  }
}
}

/* ---------- 1c. several courts ---------- */
console.log("\nCourts (slots used / fewest possible)\n");

for (const [courts, n, sx, sameSex] of [
  [2, 8], [2, 9], [2, 10], [2, 11], [2, 14], [3, 12], [3, 13], [3, 14], [4, 16],
  [2, 8, ["m", "f", "m", "f", "m", "f", "m", "f"], false],
  [2, 10, ["m", "f", "m", "f", "m", "f", "m", "f", "m", "f"], true]]) {
  const tag = `${courts} courts N=${n}${sx ? (sameSex ? " mixed+same" : " mixed") : ""}`;
  const built = ctx.buildSchedule(n, 0, sx || null, !!sameSex, courts);
  check(!!built, `${tag} built a schedule`);
  if (!built) continue;
  check(built.slot.length === built.rounds.length, `${tag} every game has a slot`);
  check(built.slot.every((s, i) => i === 0 || s === built.slot[i - 1] || s === built.slot[i - 1] + 1),
    `${tag} slots run in order`);

  const slots = [];
  built.rounds.forEach((g, i) => (slots[built.slot[i]] = slots[built.slot[i]] || []).push(g));
  slots.forEach((sl, k) => {
    check(sl.length <= courts, `${tag} slot ${k + 1} uses ${sl.length} courts`);
    const ps = sl.flatMap(g => [...g[0], ...g[1]]);
    check(new Set(ps).size === ps.length, `${tag} slot ${k + 1} has someone on two courts`);
  });

  check(slots.every((sl, k) => sl.length === courts || slots.slice(k).every(x => x.length < courts)),
    `${tag} a part-empty slot comes before a full one`);

  const gp = new Array(n).fill(0);
  built.rounds.forEach(g => [...g[0], ...g[1]].forEach(p => gp[p]++));
  const floor = Math.max(Math.ceil(built.rounds.length / courts), ...gp);
  // a greedy packer won't always hit the floor, but it shouldn't be far off
  check(slots.length <= floor + Math.ceil(floor / 4), `${tag} ${slots.length} slots is too many (floor ${floor})`);
  console.log(`  ${tag.padEnd(26)} ${String(built.rounds.length).padStart(2)} games in ${slots.length}/${floor} slots`);
}

/* ---------- 1d. time limit: fewer games, the same number each ---------- */
console.log("\nTime limit (games each, slots used / slots in the time)\n");

const setup = (n, sx, format, courts, limit, points) => vm.runInContext(
  `names = ${JSON.stringify(POOL.slice(0, n))}; genders = ${JSON.stringify(sx || Array(n).fill(""))};
   format = ${JSON.stringify(format)}; courts = ${courts}; limit = ${limit}; points = ${points};`, ctx);
const mf = n => Array.from({ length: n }, (_, i) => i % 2 ? "f" : "m");

for (const [n, courts, limit, points, format] of [
  [8, 1, 60, 9, "any"], [10, 1, 60, 9, "any"], [12, 2, 60, 9, "any"], [9, 1, 90, 9, "any"],
  [7, 1, 60, 9, "any"], [14, 3, 60, 9, "any"], [16, 4, 60, 9, "any"], [6, 1, 30, 9, "any"],
  [12, 2, 60, 7, "any"], [8, 2, 45, 9, "mixed"], [10, 2, 60, 9, "same"]]) {
  const sx = format === "any" ? null : mf(n);
  setup(n, sx, format, courts, limit, points);
  const tag = `${n}p ${courts}c ${limit}m first-to-${points} ${format}`;
  check(vm.runInContext(`needsCut(${n})`, ctx), `${tag} should need cutting down`);
  const lp = vm.runInContext(`limitedPlan(${n})`, ctx);
  check(!!lp, `${tag} has a plan`);
  if (!lp) continue;
  const C = Math.min(courts, Math.floor(n / 4));
  const b = ctx.buildLimited(n, sx, format === "same", C, lp.G);
  check(b.rounds.length === lp.G, `${tag} made ${b.rounds.length} of ${lp.G} games`);

  const gp = new Array(n).fill(0), seen = {};
  b.rounds.forEach((g, i) => {
    check(new Set([...g[0], ...g[1]]).size === 4, `${tag} game ${i + 1} has a duplicate player`);
    if (sx) check(kind(g[0], sx) === kind(g[1], sx), `${tag} game ${i + 1} is ${kind(g[0], sx)} v ${kind(g[1], sx)}`);
    if (format === "mixed") check(kind(g[0], sx) === "mf", `${tag} game ${i + 1} isn't boy & girl`);
    [...g[0], ...g[1]].forEach(p => gp[p]++);
    g.forEach(p => { const k = p.join("-"); check(!seen[k], `${tag} ${k} partner twice`); seen[k] = 1; });
  });
  const lo = Math.min(...gp), hi = Math.max(...gp);
  check(lo >= 1, `${tag} someone never plays`);
  if (lp.G * 4 === n * lp.k && format === "any") check(lo === hi, `${tag} should be ${lp.k} each, got ${lo}-${hi}`);
  else check(hi - lo <= 1 || format !== "any", `${tag} spread ${lo}-${hi} is more than one`);

  const slots = Math.max(...b.slot) + 1, inTime = Math.floor(limit / (12 * points / 9));
  check(slots <= inTime, `${tag} needs ${slots} slots, only ${inTime} fit`);
  console.log(`  ${tag.padEnd(30)} ${String(lp.G).padStart(2)} games, ${lo === hi ? lo : lo + "-" + hi} each, ${slots}/${inTime} slots`);
}

// no time limit, or one that's long enough, leaves the full schedule alone
setup(8, null, "any", 1, 0, 9); check(!vm.runInContext("needsCut(8)", ctx), "no limit never cuts");
setup(8, null, "any", 2, 180, 9); check(!vm.runInContext("needsCut(8)", ctx), "3 hours fits 8 on two courts");
// and suggests fewer points when that would fit everyone-with-everyone
setup(8, null, "any", 2, 75, 9);
check(vm.runInContext("fitPoints(8)", ctx) === 8, `8 on two courts in 75 min: first to 8 should fit, got ${vm.runInContext("fitPoints(8)", ctx)}`);

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

/* ---------- 3. another round: everyone plays everyone again ---------- */
console.log("\nAnother round");

const T_of = () => vm.runInContext("JSON.parse(JSON.stringify(T))", ctx);
// 8 or more players go on two courts, so adding a round is checked there too
const fresh = (n, sx, format) => {
  const courts = n >= 8 ? 2 : 1;
  const b = ctx.buildSchedule(n, 0, sx, format === "same", courts);
  const gp = new Array(n).fill(0);
  b.rounds.forEach(g => [...g[0], ...g[1]].forEach(p => gp[p]++));
  setT({ players: POOL.slice(0, n), rounds: b.rounds, extras: b.extras, results: {}, countBest: Math.min(...gp),
         format, genders: sx, star: 0, starts: [0], final: { a: [0, 1], b: [2, 3], result: null },
         courts, slot: b.slot });
  return b.rounds.length;
};

for (const [n, sx, format] of [[6, null, "any"], [7, null, "any"],
                                [8, ["m", "f", "m", "f", "m", "f", "m", "f"], "mixed"],
                                [9, ["m", "f", "m", "f", "m", "f", "m", "f", "m"], "same"]]) {
  const len = fresh(n, sx, format);
  const before = T_of().countBest;
  check(vm.runInContext("addRound()", ctx) === true, `${format} N=${n} addRound worked`);
  const t = T_of();
  check(t.rounds.length === len * 2, `${format} N=${n} should have ${len * 2} games, got ${t.rounds.length}`);
  check(JSON.stringify(t.starts) === JSON.stringify([0, len]), `${format} N=${n} round 2 starts at game ${len + 1}`);
  check(t.countBest === before * 2, `${format} N=${n} best-N should double ${before} -> ${before * 2}, got ${t.countBest}`);
  check(t.final === null, `${format} N=${n} adding a round clears the final`);
  check(t.slot.length === t.rounds.length && t.slot[len] === t.slot[len - 1] + 1,
    `${format} N=${n} round 2 slots carry on from round 1`);
  if (sx) t.rounds.forEach((g, i) =>
    check(kind(g[0], sx) === kind(g[1], sx), `${format} N=${n} game ${i + 1} is ${kind(g[0], sx)} v ${kind(g[1], sx)}`));
  console.log(`  ${format.padEnd(5)} N=${n}  ${len} -> ${t.rounds.length} games  best-${before} -> best-${t.countBest}`);
}

/* ---------- 4. the final: top four, or top two of each in mixed ---------- */
console.log("\nFinal");

const scoreAll = () => {
  const r = {};
  T_of().rounds.forEach((g, i) => { r[i] = { a: 9, b: (i * 5) % 9 }; });
  setResults(r);
};

fresh(7, null, "any"); scoreAll();
let order = table().map(r => r.p), fin = vm.runInContext("pickFinal()", ctx);
check(JSON.stringify(fin.a) === JSON.stringify([order[0], order[3]]) &&
      JSON.stringify(fin.b) === JSON.stringify([order[1], order[2]]), "anyone: final is 1st + 4th v 2nd + 3rd");
console.log(`  anyone  ${fin.a.map(p => POOL[p]).join(" & ")} v ${fin.b.map(p => POOL[p]).join(" & ")}`);

const sx8 = ["m", "f", "f", "m", "m", "f", "m", "f"];
for (const format of ["mixed", "same"]) {
  fresh(8, sx8, format); scoreAll();
  order = table().map(r => r.p); fin = vm.runInContext("pickFinal()", ctx);
  const boys = order.filter(p => sx8[p] === "m").slice(0, 2), girls = order.filter(p => sx8[p] === "f").slice(0, 2);
  check(fin.a[0] === boys[0] && fin.a[1] === girls[1] && fin.b[0] === boys[1] && fin.b[1] === girls[0],
    `${format}: final is top boy + 2nd girl v 2nd boy + top girl`);
  console.log(`  ${format.padEnd(6)}  ${fin.a.map(p => POOL[p]).join(" & ")} v ${fin.b.map(p => POOL[p]).join(" & ")}`);
}

/* ---------- 5. average ranking ---------- */
console.log("\nAverage ranking");

// A plays 2 (9 + 9), B plays 3 (9 + 9 + 0): totals favour B, averages A
setT({ players: ["A", "B", "C", "D", "E"], ranking: "avg", countBest: 2, extras: null, results: {},
       rounds: [[[0, 1], [2, 3]], [[0, 1], [2, 4]], [[1, 2], [3, 4]]] });
setResults({ 0: { a: 9, b: 3 }, 1: { a: 9, b: 5 }, 2: { a: 0, b: 9 } });
const avgT = table();
const rowOf = nm => avgT.find(r => r.name === nm);
check(rowOf("A").avg === 9 && rowOf("B").avg === 6, `A averages 9 and B 6, got ${rowOf("A").avg} and ${rowOf("B").avg}`);
check(avgT.indexOf(rowOf("A")) < avgT.indexOf(rowOf("B")), "A ranks above B on average despite a lower total");
check(avgT.every(r => r.dropped.length === 0), "average ranking never drops scores");
console.log(`  ${avgT.map(r => `${r.name} ${r.avg.toFixed(1)}`).join("  ")}`);

/* ---------- 6. add a game: least-played first ---------- */
console.log("\nAdd a game");

const run = code => vm.runInContext(code, ctx);
setT({ players: POOL.slice(0, 6), ranking: "avg", countBest: 1, extras: null, results: {}, courts: 1, starts: [0],
       rounds: [[[0, 1], [2, 3]], [[0, 2], [1, 4]]], slot: [0, 1] });
// 5 (Georgie) hasn't played, 3 (Barnaby) and 4 (Antonio) once
check(run("addGame()") === true, "addGame worked");
let tg = T_of(), newG = tg.rounds[2];
check(tg.rounds.length === 3 && tg.slot[2] === 2, "one new game in a new slot");
check([...newG[0], ...newG[1]].includes(5), "the player who hasn't played gets on");
check(!JSON.stringify(newG).includes("[0,1]") && !JSON.stringify(newG).includes("[0,2]"), "no partnership repeated when avoidable");
console.log(`  added ${newG.map(p => p.map(i => POOL[i]).join(" & ")).join(" v ")}`);

setT({ ...tg, courts: 2, players: POOL.slice(0, 9) });
check(run("addGame()") === true && T_of().rounds.length === 5, "two courts adds two games at once");

/* ---------- 7. editing a tournament in progress ---------- */
console.log("\nEditing");

const startEditOn = t => { setT(t); run("names = []; startEdit()"); };
const base8 = () => {
  const b = ctx.buildSchedule(8, 0, null, false, 1);
  return { players: POOL.slice(0, 8), rounds: b.rounds, slot: b.slot, extras: b.extras, results: { 0: { a: 9, b: 4 }, 1: { a: 6, b: 9 } },
           countBest: 7, format: "any", genders: null, star: 0, starts: [0], final: null, courts: 1, target: 9, limit: 0, ranking: "avg" };
};

// rename only: nothing rebuilt
let t0 = base8(); startEditOn(t0);
run("names[1] = 'Alexander'; saveEdit(); editing = false;");
let t1 = T_of();
check(t1.players[1] === "Alexander", "rename sticks");
check(JSON.stringify(t1.rounds) === JSON.stringify(t0.rounds), "a rename leaves every game alone");
check(t1.results[0].a === 9 && t1.results[1].b === 9, "scores kept");

// points change without a time limit: games stay, target changes
startEditOn(t0); run("points = 11; saveEdit(); editing = false;");
t1 = T_of();
check(t1.target === 11 && JSON.stringify(t1.rounds) === JSON.stringify(t0.rounds), "points change keeps the games");

// remove one player and add one: scored games kept, the rest rebuilt without the leaver
startEditOn(t0);
run("names.splice(3, 1); genders.splice(3, 1); editFrom.splice(3, 1); names.push('Zed'); genders.push(''); editFrom.push(-1); saveEdit(); editing = false;");
t1 = T_of();
const scored = [t0.rounds[0], t0.rounds[1]];
check(JSON.stringify(t1.rounds.slice(0, 2)) === JSON.stringify(scored), "the two scored games are first and unchanged");
check(t1.results[0].a === 9 && t1.results[1].a === 6, "their results moved with them");
check(t1.left.includes(3), "the removed player is marked as left");
const later = t1.rounds.slice(2).flatMap(g => [...g[0], ...g[1]]);
check(!later.includes(3), "the removed player isn't in any new game");
check(later.includes(8) && t1.players[8] === "Zed", "the new player is in the new games");
const tbl7 = vm.runInContext("JSON.parse(JSON.stringify(standings()))", ctx);
check(tbl7.length === 8 && !tbl7.some(r => r.p === 3), "the table has the 8 still playing, not the leaver");
const gp7 = new Array(9).fill(0); t1.rounds.forEach(g => [...g[0], ...g[1]].forEach(p => gp7[p]++));
const act7 = [0, 1, 2, 4, 5, 6, 7, 8].map(p => gp7[p]);
check(Math.max(...act7) - Math.min(...act7) <= 2, `games each stay close after the edit, got ${act7.join(",")}`);
console.log(`  ${t1.rounds.length} games after swapping Barnaby for Zed; games each ${act7.join(",")}`);

// games with someone who has since left still count: Cisco (2) and Milo (5)
// have 3 games each, two of them with Ned (6), who left, so they sit out
setT({ players: ["Freddie", "Alexander", "Cisco", "Georgie", "Kit", "Milo", "Ned", "Lily", "Zed"], left: [6],
       rounds: [[[0, 2], [5, 6]], [[3, 4], [1, 7]], [[0, 7], [2, 6]], [[4, 8], [3, 5]], [[1, 2], [5, 8]]],
       slot: [0, 1, 2, 3, 4], results: {}, courts: 1, ranking: "avg", countBest: 2 });
for (let k = 0; k < 5; k++) {
  setT({ ...T_of(), rounds: T_of().rounds.slice(0, 5), slot: [0, 1, 2, 3, 4] });
  run("addGame()");
  const on = T_of().rounds[5].flat().flat();
  check(!on.includes(2) && !on.includes(5), `added game puts on Cisco or Milo, who have played most: ${JSON.stringify(T_of().rounds[5])}`);
}

// courts only: same unplayed games, re-packed onto two
startEditOn(t0); run("courts = 2; saveEdit(); editing = false;");
t1 = T_of();
const sortG = r => r.map(g => JSON.stringify(g)).sort().join("|");
check(sortG(t1.rounds) === sortG(t0.rounds), "changing courts keeps the same games");
check(t1.courts === 2 && Math.max(...t1.slot) + 1 < t0.rounds.length, "and packs them onto two courts");

// cancelling puts the setup screen back as it was
setT(t0); run("names = ['x','y']; courts = 3; startEdit(); names = ['changed']; endEdit();");
check(run("names.join()") === "x,y" && run("courts") === 3 && T_of().players[1] === "Alex", "cancel restores setup and leaves the tournament alone");

console.log(pass ? "\nALL CHECKS PASSED" : "\nFAILURES FOUND");
process.exit(pass ? 0 : 1);
