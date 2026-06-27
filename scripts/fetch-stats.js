// Nightly stats fetcher — run by GitHub Actions.
// Pulls each rookie's season game logs from balldontlie (paced under the
// free-tier limit) and writes data.json, which the website reads directly.
// Requires Node 18+ (global fetch).

const fs = require("fs");
const path = require("path");
const { BALLDONTLIE_API_KEY, SEASON, TEAMS, TOP_GAMES_PER_ROOKIE } = require("../config.js");

const API_BASE = "https://api.balldontlie.io/v1";
const MIN_GAP_MS = 13000; // ~4.6 req/min, under the 5/min free-tier cap
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastReq = 0;
async function api(p) {
  const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastReq));
  if (wait) await sleep(wait);
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await fetch(`${API_BASE}${p}`, { headers: { Authorization: BALLDONTLIE_API_KEY } });
      if (res.status === 429) {
        const ra = parseInt(res.headers.get("Retry-After"), 10);
        const w = (Number.isFinite(ra) ? ra : 15 * (attempt + 1)) * 1000;
        console.log(`  rate limited, waiting ${Math.round(w / 1000)}s…`);
        await sleep(w);
        continue;
      }
      if (!res.ok) throw new Error(`API ${res.status} on ${p}`);
      return res.json();
    }
    throw new Error("still rate limited after retries");
  } finally {
    lastReq = Date.now();
  }
}

async function findPlayerId(name) {
  const { data } = await api(`/players?search=${encodeURIComponent(name)}&per_page=25`);
  if (!data || data.length === 0) return null;
  const exact = data.find((p) => `${p.first_name} ${p.last_name}`.toLowerCase() === name.toLowerCase());
  return (exact || data[0]).id;
}

async function fetchSeasonGames(playerId) {
  const games = [];
  let cursor = null;
  do {
    const q = `/stats?seasons[]=${SEASON}&player_ids[]=${playerId}&per_page=100` + (cursor ? `&cursor=${cursor}` : "");
    const { data, meta } = await api(q);
    for (const g of data) {
      if (g.min === null || g.min === "00" || g.min === "0") continue;
      games.push((g.pts || 0) + (g.reb || 0) + (g.ast || 0));
    }
    cursor = meta && meta.next_cursor ? meta.next_cursor : null;
  } while (cursor);
  return games;
}

function rookieScore(praGames) {
  return [...praGames].sort((a, b) => b - a).slice(0, TOP_GAMES_PER_ROOKIE).reduce((s, v) => s + v, 0);
}

(async () => {
  const out = [];
  for (const team of TEAMS) {
    const rookies = [];
    for (const r of team.roster) {
      process.stdout.write(`Fetching ${r.display}… `);
      try {
        const id = await findPlayerId(r.name);
        if (id === null) {
          console.log("not in league yet");
          rookies.push({ display: r.display, name: r.name, score: 0, gp: 0, notFound: true });
        } else {
          const games = await fetchSeasonGames(id);
          console.log(`${games.length} games, ${rookieScore(games)} PRA`);
          rookies.push({ display: r.display, name: r.name, score: rookieScore(games), gp: games.length });
        }
      } catch (e) {
        console.log(`error: ${e.message}`);
        rookies.push({ display: r.display, name: r.name, score: 0, gp: 0, error: true });
      }
    }
    out.push({ owner: team.owner, color: team.color, rookies });
  }

  const payload = { updated: new Date().toISOString(), season: SEASON, teams: out };
  fs.writeFileSync(path.join(__dirname, "..", "data.json"), JSON.stringify(payload, null, 2) + "\n");
  console.log("Wrote data.json");
})().catch((e) => { console.error(e); process.exit(1); });
