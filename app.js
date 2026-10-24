"use strict";

const statusEl = document.getElementById("status");
const scoreboardEl = document.getElementById("scoreboard");
const teamsEl = document.getElementById("teams");

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
async function run() {
  document.getElementById("refreshBtn").disabled = true;
  try {
    if (DEMO_MODE) {
      const snap = await loadStatic("dummy-data.json");
      if (snap) { render(snap.teams); setStatus("⚠️ DEMO DATA — set DEMO_MODE=false in config.js for live stats"); return; }
    }
    // Stats are refreshed nightly by GitHub Actions into data.json. loadStatic
    // cache-busts, so the refresh button always pulls the latest committed file.
    const snap = await loadStatic("data.json");
    if (snap) {
      render(snap.teams);
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

document.getElementById("refreshBtn").addEventListener("click", () => run());
run();
