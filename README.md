# 🏀 Rookie PRA League — 2026–27

A live head-to-head tracker for a 6-rookie draft league between **Rodger** and **Jimmy**.

## Scoring
- **Per rookie:** sum of PRA (points + rebounds + assists) over their **top 50 games**.
- **Per team:** sum of the **best 5 of 6** rookies (lowest is dropped).
- Stats pulled live from [balldontlie.io](https://www.balldontlie.io) and cached in your browser for 6 hours.

## Setup (one time)
1. Create a free account + API key at <https://app.balldontlie.io>.
2. Open `config.js` and paste the key into `BALLDONTLIE_API_KEY`.
3. (Optional) adjust rosters, season, or scoring knobs in `config.js`.

## Deploy to GitHub Pages
1. Create a new GitHub repo and push these files (keep them at the repo root).
2. Repo → **Settings → Pages** → Source: **Deploy from a branch** → branch `main`, folder `/ (root)`.
3. Your site goes live at `https://<your-username>.github.io/<repo-name>/`.

## Local preview
Open `index.html` in a browser, or run a tiny server:
```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Notes
- These are 2026 draft prospects — the tracker reads **0** and shows *“not in league yet”* until they're on NBA rosters and appear in the API. It fills in automatically once the season starts.
- The free-tier API key is visible in page source on a public site. That's fine for a read-only free key.
- Free tier is rate-limited (~5 requests/min). The app fetches slowly and caches results; hit **Refresh stats** to force an update.
