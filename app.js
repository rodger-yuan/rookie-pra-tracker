"use strict";

const API_BASE = "https://api.balldontlie.io/v1";
const CACHE_KEY = `rookie-pra-${SEASON}`;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const statusEl = document.getElementById("status");
const scoreboardEl = document.getElementById("scoreboard");
const teamsEl = document.getElementById("teams");

function setStatus(msg) { statusEl.textContent = msg; }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Throttled API ────────────────────────────────────────────────
// balldontlie free tier is ~5 requests/min. Serialize every call through a
// single chain with a minimum gap, and back off + retry on a 429.
const MIN_GAP_MS = 13000; // ~4.6 req/min, safely under the free-tier limit
let _chain = Promise.resolve();
let _lastReq = 0;

async function rawApi(path) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: BALLDONTLIE_API_KEY },
    });
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After"), 10);
      const wait = (Number.isFinite(retryAfter) ? retryAfter : 15 * (attempt + 1)) * 1000;
      setStatus(`Rate limited — waiting ${Math.round(wait / 1000)}s before retrying…`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`API ${res.status} on ${path}`);
    return res.json();
  }
  throw new Error("Still rate limited after several retries — try again in a few minutes.");
}

// Gate all requests so they're spaced at least MIN_GAP_MS apart.
function api(path) {
  _chain = _chain.then(async () => {
    const wait = Math.max(0, MIN_GAP_MS - (Date.now() - _lastReq));
    if (wait) await sleep(wait);
    try { return await rawApi(path); }
    finally { _lastReq = Date.now(); }
  });
  return _chain;
}

// Find a player's balldontlie id by name. Returns null if not in the league yet.
async function findPlayerId(name) {
  const { data } = await api(`/players?search=${encodeURIComponent(name)}&per_page=25`);
  if (!data || data.length === 0) return null;
  // Prefer an exact "First Last" match, else take the first result.
  const exact = data.find(
    (p) => `${p.first_name} ${p.last_name}`.toLowerCase() === name.toLowerCase()
  );
  return (exact || data[0]).id;
}

// Pull every game stat line for a player in SEASON, following the cursor.
async function fetchSeasonGames(playerId) {
  const games = [];
  let cursor = null;
  do {
    const q = `/stats?seasons[]=${SEASON}&player_ids[]=${playerId}&per_page=100` +
      (cursor ? `&cursor=${cursor}` : "");
    const { data, meta } = await api(q);
    for (const g of data) {
      if (g.min === null || g.min === "00" || g.min === "0") continue; // didn't play
      games.push((g.pts || 0) + (g.reb || 0) + (g.ast || 0));
    }
    cursor = meta && meta.next_cursor ? meta.next_cursor : null;
  } while (cursor);
  return games;
}

// score = sum of top-N PRA games
function rookieScore(praGames) {
  const sorted = [...praGames].sort((a, b) => b - a).slice(0, TOP_GAMES_PER_ROOKIE);
  return sorted.reduce((s, v) => s + v, 0);
}

// ── Data orchestration (per-rookie caching) ──────────────────────
function rookieCacheKey(r) { return `${CACHE_KEY}-r-${r.name}`; }

function readRookieCache(r) {
  try {
    const raw = localStorage.getItem(rookieCacheKey(r));
    if (!raw) return null;
    const { ts, rookie } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    return rookie;
  } catch { return null; }
}
function writeRookieCache(r, rookie) {
  try { localStorage.setItem(rookieCacheKey(r), JSON.stringify({ ts: Date.now(), rookie })); } catch {}
}

// Count how many rookies still need a network fetch (for progress display).
function pendingCount(force) {
  let n = 0;
  for (const team of TEAMS)
    for (const r of team.roster)
      if (force || !readRookieCache(r)) n++;
  return n;
}

async function loadData({ force = false } = {}) {
  if (!BALLDONTLIE_API_KEY || BALLDONTLIE_API_KEY === "PASTE_YOUR_FREE_KEY_HERE") {
    throw new Error("No API key set — edit config.js and add your free balldontlie key.");
  }

  const remaining = pendingCount(force);
  let done = 0;
  const eta = () => remaining ? ` (~${Math.ceil((remaining - done) * MIN_GAP_MS / 1000)}s left)` : "";

  const result = [];
  for (const team of TEAMS) {
    const rookies = [];
    for (const r of team.roster) {
      const cached = !force && readRookieCache(r);
      if (cached) { rookies.push(cached); continue; }

      setStatus(`Fetching ${r.display}…${eta()}`);
      let rookie;
      try {
        const id = await findPlayerId(r.name);
        if (id === null) {
          rookie = { ...r, score: 0, gp: 0, notFound: true };
        } else {
          const games = await fetchSeasonGames(id);
          rookie = { ...r, score: rookieScore(games), gp: games.length };
        }
        writeRookieCache(r, rookie); // persist so a reload won't re-fetch
      } catch (e) {
        // On hard rate-limit exhaustion, surface what we have so far.
        if (String(e.message).includes("rate limited")) {
          result.push({ ...team, rookies });
          throw Object.assign(new Error(e.message), { partial: result });
        }
        rookie = { ...r, score: 0, gp: 0, error: true };
      }
      rookies.push(rookie);
      done++;
    }
    result.push({ ...team, rookies });
  }
  return result;
}

// ── Rendering ────────────────────────────────────────────────────
function teamTotal(team) {
  const ranked = [...team.rookies].sort((a, b) => b.score - a.score);
  const counted = ranked.slice(0, ROOKIES_COUNTED);
  const dropped = ranked.slice(ROOKIES_COUNTED);
  const total = counted.reduce((s, r) => s + r.score, 0);
  return { total, droppedNames: new Set(dropped.map((r) => r.display)) };
}

function render(data) {
  const computed = data.map((t) => ({ team: t, ...teamTotal(t) }));
  const leader = Math.max(...computed.map((c) => c.total));

  // Scoreboard cards
  scoreboardEl.innerHTML = computed
    .map((c) => {
      const winning = c.total === leader && leader > 0;
      return `
      <div class="team-card ${winning ? "leading" : ""}" style="--accent:${c.team.color}">
        <div class="owner">${c.team.owner}${winning ? " 👑" : ""}</div>
        <div class="big-total">${c.total.toLocaleString()}</div>
        <div class="label">total PRA (best ${ROOKIES_COUNTED})</div>
      </div>`;
    })
    .join("");

  // Per-team rookie tables
  teamsEl.innerHTML = computed
    .map((c) => {
      const rows = [...c.team.rookies]
        .sort((a, b) => b.score - a.score)
        .map((r) => {
          const dropped = c.droppedNames.has(r.display);
          let note = "";
          if (r.notFound) note = '<span class="tag">not in league yet</span>';
          else if (r.error) note = '<span class="tag err">fetch error</span>';
          return `
          <tr class="${dropped ? "dropped" : ""}">
            <td class="rk-name">${r.display} ${note}</td>
            <td class="rk-gp">${r.gp}</td>
            <td class="rk-score">${r.score.toLocaleString()}</td>
          </tr>`;
        })
        .join("");
      return `
      <div class="team-block" style="--accent:${c.team.color}">
        <h2>${c.team.owner}</h2>
        <table>
          <thead><tr><th>Rookie</th><th>GP</th><th>PRA (top 50)</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td>Best ${ROOKIES_COUNTED} of 6</td><td></td><td>${c.total.toLocaleString()}</td></tr></tfoot>
        </table>
      </div>`;
    })
    .join("");
}

// ── Boot ─────────────────────────────────────────────────────────
async function run({ force = false } = {}) {
  document.getElementById("refreshBtn").disabled = true;
  try {
    const data = await loadData({ force });
    render(data);
    setStatus(`Updated ${new Date().toLocaleString()}`);
  } catch (e) {
    if (e.partial) render(e.partial); // show whatever completed before the limit
    setStatus(`⚠️ ${e.message}`);
  } finally {
    document.getElementById("refreshBtn").disabled = false;
  }
}

document.getElementById("refreshBtn").addEventListener("click", () => run({ force: true }));
run();
