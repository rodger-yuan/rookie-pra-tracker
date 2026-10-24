# 🏀 Rookie PRA League — 2026–27

A live head-to-head tracker for a 6-rookie draft league between **Rodger** and **Jimmy**.

## Scoring
- **Per rookie:** sum of PRA (points + rebounds + assists) over their **top 50 games**.
- **Per team:** sum of the **best 5 of 6** rookies (lowest is dropped).
- Stats come from ESPN's free public API and are refreshed nightly by a GitHub Action into `data.json`, which the site reads directly.

## Setup (one time)
No API key needed. Players are looked up by their **ESPN athlete id** (the number in an `espn.com/nba/player/_/id/<ID>/` URL). To change rosters, season, or scoring, edit `config.js`.

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
- Each rookie reads **0** until they've played regular-season NBA games; the nightly job fills stats in automatically as games happen.
- The nightly update runs via `.github/workflows/update-stats.yml` (and can be triggered manually from the repo's **Actions** tab). **Refresh stats** on the page re-pulls the latest `data.json`.
