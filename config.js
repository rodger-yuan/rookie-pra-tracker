// ── EDIT THIS FILE ──────────────────────────────────────────────
// 1. Get a free API key at https://app.balldontlie.io  (free tier is fine)
// 2. Paste it below.
// Note: on a public GitHub Pages site this key is visible in page source.
// That's acceptable for a free read-only key — worst case is your rate limit.
const BALLDONTLIE_API_KEY = "598e95a1-7fcc-4086-809d-9da43f8162be";

// The NBA season to track. "2026" = the 2026–27 season.
const SEASON = 2026;

// DEMO_MODE loads dummy-data.json so you can preview the UI before the season
// starts. Set to false to use the real nightly data.json.
const DEMO_MODE = true;

// Rosters. `name` is what's searched on balldontlie — match the NBA spelling.
// `display` is what's shown on the page.
const TEAMS = [
  {
    owner: "Rodger",
    color: "#e8590c",
    roster: [
      { display: "Darryn Peterson",    name: "Darryn Peterson" },
      { display: "AJ Dybantsa",        name: "AJ Dybantsa" },
      { display: "Yaxel Lendeborg",    name: "Yaxel Lendeborg" },
      { display: "Brayden Burries",    name: "Brayden Burries" },
      { display: "Caleb Wilson",       name: "Caleb Wilson" },
      { display: "Nate Ament",         name: "Nate Ament" },
    ],
  },
  {
    owner: "Jimmy",
    color: "#1c7ed6",
    roster: [
      { display: "Cameron Boozer",     name: "Cameron Boozer" },
      { display: "Darius Acuff Jr.",   name: "Darius Acuff" },
      { display: "Mikel Brown Jr.",    name: "Mikel Brown" },
      { display: "Kingston Flemings",  name: "Kingston Flemings" },
      { display: "Keaton Wagler",      name: "Keaton Wagler" },
      { display: "Morez Johnson Jr.",  name: "Morez Johnson" },
    ],
  },
];

// Scoring knobs
const TOP_GAMES_PER_ROOKIE = 50; // count each rookie's best N games
const ROOKIES_COUNTED = 5;       // best M of 6 rookies count per team

// Make this file importable by the nightly Node fetch script too.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { BALLDONTLIE_API_KEY, SEASON, DEMO_MODE, TEAMS, TOP_GAMES_PER_ROOKIE, ROOKIES_COUNTED };
}
