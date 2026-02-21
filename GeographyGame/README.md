# GeoQuest – Geography Guessing Game

A browser-based geography guessing game. A city name is shown on screen and you
must click as close as possible to it on the world map. The closer you click,
the more points you earn.

## How to play

1. Open `index.html` in any modern browser (Chrome, Firefox, Edge, Safari).
   *An internet connection is required to load map tiles.*
2. Choose the number of rounds (5–20) and a difficulty level.
3. Click **Start Game**.
4. Each round:
   - A city name appears at the top of the screen.
   - Click where you think that city is on the map.
   - You have **30 seconds** per round.
   - After clicking, the correct location is revealed and your distance is shown.
5. After all rounds, a summary screen shows your total score and a per-round breakdown.

## Scoring

| Distance from target | Points |
|----------------------|--------|
| 0 km                 | 5 000  |
| 500 km               | ~4 505 |
| 1 000 km             | ~3 062 |
| 2 500 km             | ~781   |
| ≥ 5 000 km           | 0      |

Score uses a quadratic falloff: `points = 5000 × (1 − dist/5000)²`

## Difficulty levels

| Level  | Locations included                       |
|--------|------------------------------------------|
| Easy   | 25 major world capitals & iconic cities  |
| Medium | Easy + 45 regional capitals & known cities |
| Hard   | All 120+ locations including smaller cities |

## Project structure

```
GeographyGame/
├── index.html       # Game shell & Leaflet map container
├── css/
│   └── style.css    # All styling (dark theme)
├── js/
│   ├── locations.js # Location database (name, lat, lng, difficulty)
│   └── game.js      # Game logic, map interaction, scoring, UI
└── README.md
```

## Adding more locations

Open `js/locations.js` and add entries to the `LOCATIONS` array:

```js
{ name: "Your City", lat: 12.345, lng: 67.890, difficulty: "medium" },
```

Difficulty must be `"easy"`, `"medium"`, or `"hard"`.

## Dependencies (loaded from CDN)

- [Leaflet.js 1.9.4](https://leafletjs.com/) – interactive map
- [CartoDB Positron](https://carto.com/basemaps/) – map tile style
