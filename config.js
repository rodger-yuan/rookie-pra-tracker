// ── EDIT THIS FILE ──────────────────────────────────────────────
// Stats come from ESPN's free public API (no key needed). The nightly
// GitHub Action (scripts/fetch-stats.js) looks players up by ESPN athlete id.

// The NBA season to track. "2026" = the 2026–27 season.
const SEASON = 2026;

// DEMO_MODE loads dummy-data.json so you can preview the UI before the season
// starts. Set to false to use the real nightly data.json.
const DEMO_MODE = false;

// Rosters. `display` is what's shown on the page. `espnId` is the player's
// ESPN athlete id — stats are pulled from ESPN's free API by id, so names
// never have to be matched at fetch time. To add/replace a player, look up
// their id (the number in their espn.com/nba/player/_/id/<ID>/ URL).
const TEAMS = [
  {
    owner: "Rodger",
    color: "#e8590c",
    roster: [
      { display: "Darryn Peterson",    espnId: 5041955 },
      { display: "AJ Dybantsa",        espnId: 5142718 },
      { display: "Yaxel Lendeborg",    espnId: 5175737 },
      { display: "Brayden Burries",    espnId: 5082206 },
      { display: "Caleb Wilson",       espnId: 5095151 },
      { display: "Nate Ament",         espnId: 5164559 },
    ],
  },
  {
    owner: "Jimmy",
    color: "#1c7ed6",
    roster: [
      { display: "Cameron Boozer",     espnId: 5041935 },
      { display: "Darius Acuff Jr.",   espnId: 5142620 },
      { display: "Mikel Brown Jr.",    espnId: 5101761 },
      { display: "Kingston Flemings",  espnId: 5149077 },
      { display: "Keaton Wagler",      espnId: 5254165 },
      { display: "Morez Johnson Jr.",  espnId: 4873153 },
    ],
  },
];

// Scoring knobs
const TOP_GAMES_PER_ROOKIE = 50; // count each rookie's best N games
const ROOKIES_COUNTED = 5;       // best M of 6 rookies count per team

// Make this file importable by the nightly Node fetch script too.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { SEASON, DEMO_MODE, TEAMS, TOP_GAMES_PER_ROOKIE, ROOKIES_COUNTED };
}
