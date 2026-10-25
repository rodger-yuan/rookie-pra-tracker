"use strict";

const statusEl = document.getElementById("status");
const scoreboardEl = document.getElementById("scoreboard");
const teamsEl = document.getElementById("teams");
const leadersEl = document.getElementById("leaders");

function setStatus(msg) { statusEl.textContent = msg; }

// ── Stat computation (single source: a rookie's games[] array) ───
const praOf = (g) => (g.pts || 0) + (g.reb || 0) + (g.ast || 0);

function computeRookie(r) {
  const games = Array.isArray(r.games) ? r.games : [];
  const gp = games.length;
  const base = { ...r, games, gp, gc: 0, pra: 0, prapg: 0, pts: 0, reb: 0, ast: 0,
    mpg: 0, ppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0,
    fgPct: 0, fg3Pct: 0, tsPct: 0, fgpg: 0, fg3pg: 0, last5: [] };
  if (!gp) return base;

  const sum = (arr, f) => arr.reduce((s, g) => s + (g[f] || 0), 0);
  // Counted games = top N by PRA. Totals (PRA/PTS/REB/AST) are over these.
  const counted = [...games].sort((a, b) => praOf(b) - praOf(a)).slice(0, TOP_GAMES_PER_ROOKIE);
  base.gc = counted.length;
  base.pts = sum(counted, "pts"); base.reb = sum(counted, "reb"); base.ast = sum(counted, "ast");
  base.pra = base.pts + base.reb + base.ast;

  // Per-game averages over the full season.
  base.mpg = sum(games, "min") / gp;
  base.ppg = sum(games, "pts") / gp;
  base.rpg = sum(games, "reb") / gp;
  base.apg = sum(games, "ast") / gp;
  base.prapg = base.ppg + base.rpg + base.apg; // avg PRA per game (all games)
  base.spg = sum(games, "stl") / gp;
  base.bpg = sum(games, "blk") / gp;
  base.fgpg = sum(games, "fgm") / gp;
  base.fg3pg = sum(games, "fg3m") / gp;

  const fgm = sum(games, "fgm"), fga = sum(games, "fga");
  const fg3m = sum(games, "fg3m"), fg3a = sum(games, "fg3a");
  const ptsAll = sum(games, "pts"), fta = sum(games, "fta");
  base.fgPct = fga ? fgm / fga : 0;
  base.fg3Pct = fg3a ? fg3m / fg3a : 0;
  const tsDen = 2 * (fga + 0.44 * fta);
  base.tsPct = tsDen ? ptsAll / tsDen : 0;

  base.last5 = [...games].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);
  return base;
}

// ── Data sources ─────────────────────────────────────────────────
async function loadStatic(file) {
  try {
    const res = await fetch(`${file}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json();
    if (!j || !Array.isArray(j.teams) || !j.teams.length) return null;
    return j;
  } catch { return null; }
}

// ── Live refresh from ESPN (browser) ─────────────────────────────
// The page normally reads the nightly data.json. The Refresh button pulls the
// head-to-head rosters live from ESPN's free API so scores are up to the
// minute. (The 15-rookie leaderboard needs a league-wide scan, so it stays on
// the nightly snapshot.) Mirrors scripts/fetch-stats.js; ESPN labels seasons
// by end year, so ESPN season = SEASON + 1.
const ESPN_CORE = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba";
const ESPN_SEASON = SEASON + 1;
const espnIdOf = (ref) => (String(ref).match(/\/(\d+)(?:\?|$)/) || [])[1];
async function espnJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  return res.json();
}
async function espnPool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}
function parseEspnStats(doc) {
  const flat = {};
  for (const c of (doc.splits && doc.splits.categories) || [])
    for (const s of c.stats || []) flat[s.name] = s.value;
  const num = (k) => Number(flat[k]) || 0;
  return {
    min: Math.round(num("minutes")), pts: num("points"), reb: num("rebounds"), ast: num("assists"),
    stl: num("steals"), blk: num("blocks"), tov: num("turnovers"),
    fgm: num("fieldGoalsMade"), fga: num("fieldGoalsAttempted"),
    fg3m: num("threePointFieldGoalsMade"), fg3a: num("threePointFieldGoalsAttempted"),
    ftm: num("freeThrowsMade"), fta: num("freeThrowsAttempted"),
  };
}
async function espnTeamAbbrev() {
  const list = await espnJSON(`${ESPN_CORE}/seasons/${ESPN_SEASON}/teams?limit=40`);
  const map = {};
  await espnPool((list.items || []).map((x) => x["$ref"]), 8, async (ref) => {
    try { const t = await espnJSON(ref); map[String(t.id)] = t.abbreviation; } catch {}
  });
  return map;
}
async function espnGames(espnId, regStart, abbrev) {
  const el = await espnJSON(`${ESPN_CORE}/seasons/${ESPN_SEASON}/athletes/${espnId}/eventlog`);
  const items = ((el.events && el.events.items) || []).filter((it) => it.played && it.statistics);
  if (!items.length) return [];
  const games = await espnPool(items, 6, async (it) => {
    try {
      const [statDoc, ev] = await Promise.all([espnJSON(it.statistics["$ref"]), espnJSON(it.event["$ref"])]);
      const date = ev.date ? ev.date.slice(0, 10) : "";
      if (regStart && date && date < regStart) return null;
      const comp = (ev.competitions && ev.competitions[0]) || {};
      const oppId = (comp.competitors || [])
        .map((c) => espnIdOf(c.team && c.team["$ref"] ? c.team["$ref"] : ""))
        .find((tid) => tid && tid !== String(it.teamId));
      const s = parseEspnStats(statDoc);
      if (!s.min) return null;
      return { date, opp: (oppId && abbrev[oppId]) || "", ...s };
    } catch { return null; }
  });
  return games.filter(Boolean).sort((a, b) => (a.date < b.date ? -1 : 1));
}
async function loadLive() {
  let regStart = "";
  try {
    const t2 = await espnJSON(`${ESPN_CORE}/seasons/${ESPN_SEASON}/types/2`);
    regStart = t2.startDate ? t2.startDate.slice(0, 10) : "";
  } catch {}
  const abbrev = await espnTeamAbbrev();
  const teams = [];
  let done = 0;
  const total = TEAMS.reduce((n, t) => n + t.roster.length, 0);
  for (const team of TEAMS) {
    const rookies = [];
    for (const r of team.roster) {
      setStatus(`Fetching live stats… (${++done}/${total}) ${r.display}`);
      try {
        rookies.push({ display: r.display, name: r.display, games: await espnGames(r.espnId, regStart, abbrev) });
      } catch {
        rookies.push({ display: r.display, name: r.display, games: [], error: true });
      }
    }
    teams.push({ owner: team.owner, color: team.color, rookies });
  }
  return { teams };
}

// ── Scoring / standings ──────────────────────────────────────────
function buildStandings(teams) {
  return teams.map((t) => {
    const rookies = t.rookies.map(computeRookie).sort((a, b) => b.pra - a.pra);
    rookies.forEach((r, i) => { r.counts = i < ROOKIES_COUNTED; });
    const total = rookies.filter((r) => r.counts).reduce((s, r) => s + r.pra, 0);
    return { owner: t.owner, color: t.color, rookies, total };
  });
}

// ── Rendering ────────────────────────────────────────────────────
const fmt = (n, d = 1) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n) => (n ? (n * 100).toFixed(1) + "%" : "—");
const intc = (n) => (n || 0).toLocaleString();

const STAT_COLS = [
  { key: "mpg", label: "MPG", f: (r) => fmt(r.mpg) },
  { key: "fgPct", label: "FG%", f: (r) => pct(r.fgPct) },
  { key: "ppg", label: "PPG", f: (r) => fmt(r.ppg) },
  { key: "fg3Pct", label: "3P%", f: (r) => pct(r.fg3Pct) },
  { key: "tsPct", label: "TS%", f: (r) => pct(r.tsPct) },
  { key: "fgpg", label: "FG/G", f: (r) => fmt(r.fgpg) },
  { key: "fg3pg", label: "3P/G", f: (r) => fmt(r.fg3pg) },
  { key: "rpg", label: "RPG", f: (r) => fmt(r.rpg) },
  { key: "apg", label: "APG", f: (r) => fmt(r.apg) },
  { key: "spg", label: "SPG", f: (r) => fmt(r.spg) },
  { key: "bpg", label: "BPG", f: (r) => fmt(r.bpg) },
];

let CURRENT = []; // standings cache for modal lookups

function render(teams) {
  const standings = buildStandings(teams);
  CURRENT = standings;
  const leader = Math.max(...standings.map((s) => s.total));

  scoreboardEl.innerHTML = standings.map((s) => {
    const winning = s.total === leader && leader > 0;
    return `<div class="team-card ${winning ? "leading" : ""}" style="--accent:${s.color}">
      <div class="owner">${s.owner}${winning ? " 👑" : ""}</div>
      <div class="big-total">${intc(s.total)}</div>
      <div class="label">total PRA (best ${ROOKIES_COUNTED})</div>
    </div>`;
  }).join("");

  const head = `<tr>
      <th class="sticky-col">Player</th>
      <th>Top 5</th><th>GP</th><th>GC</th>
      <th class="grp">PRA</th><th>PRA/G</th><th>PTS</th><th>REB</th><th>AST</th>
      ${STAT_COLS.map((c) => `<th>${c.label}</th>`).join("")}
    </tr>`;

  teamsEl.innerHTML = standings.map((s, ti) => {
    const rows = s.rookies.map((r, ri) => {
      let badge, cls = "";
      if (r.notFound) badge = '<span class="tag">not in league</span>';
      else if (r.error) badge = '<span class="tag err">error</span>';
      else if (r.counts) badge = '<span class="tag ok">✓ counts</span>';
      else { badge = '<span class="tag drop">dropped</span>'; cls = "dropped"; }
      const clickable = r.gp > 0;
      return `<tr class="${cls} ${clickable ? "clickable" : ""}" ${clickable ? `data-team="${ti}" data-rk="${ri}"` : ""}>
        <td class="sticky-col rk-name">${clickable ? "▸ " : ""}${r.display}</td>
        <td>${badge}</td>
        <td>${r.gp}</td>
        <td>${r.gc}</td>
        <td class="grp num strong">${intc(r.pra)}</td>
        <td class="num">${fmt(r.prapg)}</td>
        <td class="num">${intc(r.pts)}</td>
        <td class="num">${intc(r.reb)}</td>
        <td class="num">${intc(r.ast)}</td>
        ${STAT_COLS.map((c) => `<td class="num">${c.f(r)}</td>`).join("")}
      </tr>`;
    }).join("");
    return `<div class="team-block" style="--accent:${s.color}">
      <h2>${s.owner} <span class="team-sum">${intc(s.total)} PRA</span></h2>
      <div class="table-wrap"><table>
        <thead>${head}</thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
  }).join("");

  teamsEl.querySelectorAll("tr.clickable").forEach((tr) => {
    tr.addEventListener("click", () => openModal(+tr.dataset.team, +tr.dataset.rk));
  });
}

// ── League-wide rookie leaderboard ───────────────────────────────
// Map each owned player's ESPN id to their owner + accent color so rows can be
// highlighted. Unowned rookies get no highlight.
function ownersByEspnId() {
  const map = {};
  for (const t of TEAMS) for (const r of t.roster) map[r.espnId] = { owner: t.owner, color: t.color };
  return map;
}

function renderLeaders(leaders) {
  if (!leadersEl) return;
  if (!Array.isArray(leaders) || !leaders.length) { leadersEl.innerHTML = ""; return; }
  const owners = ownersByEspnId();
  const rows = leaders.map((r, i) => {
    const o = owners[r.espnId];
    const rowAttrs = o ? `class="owned" style="--accent:${o.color}"` : "";
    const ownerCell = o
      ? `<span class="owner-chip" style="--accent:${o.color}">${o.owner}</span>`
      : '<span class="muted">—</span>';
    return `<tr ${rowAttrs}>
      <td class="num rank">${i + 1}</td>
      <td class="rk-name">${r.name}</td>
      <td>${r.team || "—"}</td>
      <td>${r.pos || "—"}</td>
      <td>${ownerCell}</td>
      <td class="num">${r.gp}</td>
      <td class="num strong">${fmt(r.prapg)}</td>
      <td class="num">${fmt(r.ppg)}</td>
      <td class="num">${fmt(r.rpg)}</td>
      <td class="num">${fmt(r.apg)}</td>
    </tr>`;
  }).join("");
  leadersEl.innerHTML = `
    <h2>Top 15 NBA Rookies <span class="muted">· by PRA per game · updated nightly</span></h2>
    <div class="table-wrap"><table>
      <thead><tr>
        <th class="num">#</th><th class="rk-name">Player</th><th>Team</th><th>Pos</th><th>Owner</th>
        <th class="num">GP</th><th class="num">PRA/G</th><th class="num">PPG</th><th class="num">RPG</th><th class="num">APG</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

// ── Last-5-games modal ───────────────────────────────────────────
function openModal(ti, ri) {
  const r = CURRENT[ti].rookies[ri];
  const rows = r.last5.map((g) => `<tr>
      <td>${g.date || "—"}</td><td>${g.opp || "—"}</td><td class="num">${g.min}</td>
      <td class="num strong">${praOf(g)}</td>
      <td class="num">${g.pts}</td><td class="num">${g.reb}</td><td class="num">${g.ast}</td>
      <td class="num">${g.fgm}-${g.fga}</td><td class="num">${g.fg3m}-${g.fg3a}</td>
      <td class="num">${g.stl}</td><td class="num">${g.blk}</td><td class="num">${g.tov}</td>
    </tr>`).join("");
  const el = document.getElementById("modal");
  el.querySelector(".modal-card").innerHTML = `
    <div class="modal-head">
      <h3>${r.display} <span class="muted">· last 5 games</span></h3>
      <button class="close" aria-label="Close">✕</button>
    </div>
    <div class="modal-sub">Season avg: ${fmt(r.ppg)} pts · ${fmt(r.rpg)} reb · ${fmt(r.apg)} ast · ${pct(r.fgPct)} FG · ${pct(r.tsPct)} TS</div>
    <div class="table-wrap"><table class="games">
      <thead><tr><th>Date</th><th>Opp</th><th>MIN</th><th>PRA</th><th>PTS</th><th>REB</th><th>AST</th><th>FG</th><th>3P</th><th>STL</th><th>BLK</th><th>TO</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="12">No games yet.</td></tr>'}</tbody>
    </table></div>`;
  el.classList.add("open");
  el.querySelector(".close").addEventListener("click", closeModal);
}
function closeModal() { document.getElementById("modal").classList.remove("open"); }
document.getElementById("modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

// ── Boot ─────────────────────────────────────────────────────────
// On load (live=false): read the nightly data.json — instant, includes the
// leaderboard. On Refresh (live=true): pull the head-to-head rosters live from
// ESPN, and still show the nightly leaderboard snapshot.
async function run({ live = false } = {}) {
  document.getElementById("refreshBtn").disabled = true;
  try {
    if (DEMO_MODE) {
      const snap = await loadStatic("dummy-data.json");
      if (snap) { render(snap.teams); setStatus("⚠️ DEMO DATA — set DEMO_MODE=false in config.js for live stats"); return; }
    }

    if (live) {
      const [liveData, snap] = await Promise.all([loadLive(), loadStatic("data.json")]);
      render(liveData.teams);
      if (snap) renderLeaders(snap.rookieLeaders);
      setStatus(`Live · updated ${new Date().toLocaleTimeString()}`);
      return;
    }

    const snap = await loadStatic("data.json");
    if (snap) {
      render(snap.teams);
      renderLeaders(snap.rookieLeaders);
      setStatus(`Auto-updated nightly · last run ${new Date(snap.updated).toLocaleString()}`);
      return;
    }
    setStatus("⚠️ No data yet — the nightly update hasn't produced data.json.");
  } catch (e) {
    setStatus(`⚠️ ${e.message}`);
  } finally {
    document.getElementById("refreshBtn").disabled = false;
  }
}

document.getElementById("refreshBtn").addEventListener("click", () => run({ live: true }));
run();
