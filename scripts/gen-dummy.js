// Generates dummy-data.json with realistic per-game logs so the UI can be
// previewed before the season starts. Run locally: `node scripts/gen-dummy.js`.
// (Not used in production — the nightly job writes the real data.json.)
const fs = require("fs");
const path = require("path");
const { SEASON, TEAMS } = require("../config.js");

const OPPS = ["BOS","LAL","GSW","MIA","DEN","NYK","PHX","DAL","MIL","PHI","OKC","CLE"];
const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.round(rnd(a, b));

// Give each rookie a "tier" so totals vary and the scoreboard is interesting.
function makeGames(tier, gp) {
  const games = [];
  const base = new Date("2026-12-15T00:00:00Z").getTime();
  for (let i = 0; i < gp; i++) {
    const form = rnd(0.7, 1.3); // night-to-night variance
    const min = Math.min(38, Math.max(12, ri(24 + tier * 6, 32 + tier * 6)));
    const fga = Math.max(2, Math.round(rnd(6, 10) * tier * form));
    const fgm = Math.round(fga * rnd(0.38, 0.55));
    const fg3a = Math.round(fga * rnd(0.2, 0.45));
    const fg3m = Math.round(fg3a * rnd(0.28, 0.45));
    const fta = Math.round(rnd(1, 6) * tier);
    const ftm = Math.round(fta * rnd(0.7, 0.9));
    const pts = (fgm - fg3m) * 2 + fg3m * 3 + ftm;
    const reb = Math.max(0, Math.round(rnd(2, 9) * tier * form));
    const ast = Math.max(0, Math.round(rnd(1, 7) * tier * form));
    const stl = ri(0, 3);
    const blk = ri(0, 2);
    const tov = ri(0, 4);
    const d = new Date(base - i * 2 * 86400000).toISOString().slice(0, 10);
    games.push({ date: d, opp: OPPS[(i + Math.round(tier * 3)) % OPPS.length],
      min, pts, reb, ast, stl, blk, tov, fgm, fga, fg3m, fg3a, ftm, fta });
  }
  return games;
}

const tiers = {}; // assign a tier per rookie name, varied across both teams
let k = 0;
const out = TEAMS.map((team) => ({
  owner: team.owner,
  color: team.color,
  rookies: team.roster.map((r) => {
    const tier = [1.35, 1.15, 1.0, 0.9, 0.8, 0.7][k % 6] * (1 + (k % 2 ? 0.05 : -0.05));
    k++;
    const gp = ri(42, 68); // some over 50 (so games-counted < games-played), some under
    return { display: r.display, name: r.name, games: makeGames(tier, gp) };
  }),
}));

const payload = { updated: new Date().toISOString(), season: SEASON, demo: true, teams: out };
fs.writeFileSync(path.join(__dirname, "..", "dummy-data.json"), JSON.stringify(payload) + "\n");
console.log("Wrote dummy-data.json");
