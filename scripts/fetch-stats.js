// Nightly stats fetcher — run by GitHub Actions.
// Pulls each rookie's regular-season game logs from ESPN's free public API
// (no key required) and writes data.json, which the website reads directly.
// Requires Node 18+ (global fetch).
//
// Players are looked up by ESPN athlete id (config.js -> roster[].espnId), so
// no name matching happens at fetch time. ESPN labels a season by the year it
// ENDS (season 2027 == the 2026-27 season), whereas our SEASON uses the start
// year, so the ESPN season year is SEASON + 1.

const fs = require("fs");
const path = require("path");
const { SEASON, TEAMS } = require("../config.js");

const CORE = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba";
const ESPN_SEASON = SEASON + 1;
const UA = { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } };

async function getJSON(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, UA);
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
      return await res.json();
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

// Run async tasks with a small concurrency cap (ESPN has no documented limit,
// but we stay polite and avoid bursts).
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k], k);
      }
    })
  );
  return out;
}

const idOf = (ref) => (ref.match(/\/(\d+)(?:\?|$)/) || [])[1];

// Flatten an ESPN box-score statistics document into the fields we need.
function parseStats(statDoc) {
  const flat = {};
  for (const c of (statDoc.splits && statDoc.splits.categories) || [])
    for (const s of c.stats || []) flat[s.name] = s.value;
  const num = (k) => Number(flat[k]) || 0;
  return {
    min: Math.round(num("minutes")),
    pts: num("points"),
    reb: num("rebounds"),
    ast: num("assists"),
    stl: num("steals"),
    blk: num("blocks"),
    tov: num("turnovers"),
    fgm: num("fieldGoalsMade"),
    fga: num("fieldGoalsAttempted"),
    fg3m: num("threePointFieldGoalsMade"),
    fg3a: num("threePointFieldGoalsAttempted"),
    ftm: num("freeThrowsMade"),
    fta: num("freeThrowsAttempted"),
  };
}

async function teamAbbrevMap() {
  const list = await getJSON(`${CORE}/seasons/${ESPN_SEASON}/teams?limit=40`);
  const refs = (list.items || []).map((x) => x["$ref"]);
  const map = {};
  await pool(refs, 8, async (ref) => {
    try {
      const t = await getJSON(ref);
      map[String(t.id)] = t.abbreviation;
    } catch {}
  });
  return map;
}

async function fetchSeasonGames(espnId, regStart, abbrev) {
  const el = await getJSON(`${CORE}/seasons/${ESPN_SEASON}/athletes/${espnId}/eventlog`);
  const items = ((el.events && el.events.items) || []).filter((it) => it.played && it.statistics);
  if (items.length === 0) return [];

  const games = await pool(items, 6, async (it) => {
    try {
      const [statDoc, ev] = await Promise.all([
        getJSON(it.statistics["$ref"]),
        getJSON(it.event["$ref"]),
      ]);
      const date = ev.date ? ev.date.slice(0, 10) : "";
      // Regular season only.
      if (regStart && date && date < regStart) return null;
      const comp = (ev.competitions && ev.competitions[0]) || {};
      const oppTeamId = (comp.competitors || [])
        .map((c) => idOf(c.team && c.team["$ref"] ? c.team["$ref"] : ""))
        .find((tid) => tid && tid !== String(it.teamId));
      const s = parseStats(statDoc);
      if (!s.min) return null; // DNP
      return { date, opp: (oppTeamId && abbrev[oppTeamId]) || "", ...s };
    } catch {
      return null;
    }
  });
  return games.filter(Boolean).sort((a, b) => (a.date < b.date ? -1 : 1));
}

(async () => {
  console.log(`Fetching from ESPN — our season ${SEASON} = ESPN season ${ESPN_SEASON}`);
  let regStart = "";
  try {
    const t2 = await getJSON(`${CORE}/seasons/${ESPN_SEASON}/types/2`);
    regStart = t2.startDate ? t2.startDate.slice(0, 10) : "";
    console.log(`Regular season starts ${regStart || "(unknown)"}`);
  } catch {
    console.log("Could not read regular-season start; including all dated games.");
  }
  const abbrev = await teamAbbrevMap();

  const out = [];
  for (const team of TEAMS) {
    const rookies = [];
    for (const r of team.roster) {
      process.stdout.write(`Fetching ${r.display}… `);
      try {
        const games = await fetchSeasonGames(r.espnId, regStart, abbrev);
        console.log(`${games.length} games`);
        rookies.push({ display: r.display, name: r.display, games });
      } catch (e) {
        console.log(`error: ${e.message}`);
        rookies.push({ display: r.display, name: r.display, games: [], error: true });
      }
    }
    out.push({ owner: team.owner, color: team.color, rookies });
  }

  const payload = { updated: new Date().toISOString(), season: SEASON, teams: out };
  fs.writeFileSync(path.join(__dirname, "..", "data.json"), JSON.stringify(payload, null, 2) + "\n");
  console.log("Wrote data.json");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
