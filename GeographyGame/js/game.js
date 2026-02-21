/**
 * GeoQuest – Geography Guessing Game
 * Core game logic: map setup, round management, scoring, UI transitions.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const ROUND_TIME_SEC  = 30;      // seconds per round
const MAX_SCORE_ROUND = 5000;    // maximum points per round
const MAX_DIST_KM     = 5000;    // distance beyond which score = 0

// ─── State ───────────────────────────────────────────────────────────────────

const state = {
  map:           null,   // Leaflet map instance
  totalRounds:   10,
  difficulty:    "medium",
  currentRound:  0,
  score:         0,
  questions:     [],     // shuffled LocationData array for this game
  roundResults:  [],     // { name, distanceKm, points } per round
  timerInterval: null,
  timeLeft:      ROUND_TIME_SEC,
  guessMarker:   null,   // Leaflet marker for player's click
  targetMarker:  null,   // Leaflet marker for correct location
  guessLine:     null,   // Leaflet polyline connecting guess → target
  awaitingNext:  false,  // true while result card is visible
};

// ─── DOM refs ────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const el = {
  screenTitle:    $("screen-title"),
  screenGame:     $("screen-game"),
  screenEnd:      $("screen-end"),
  roundsSelect:   $("rounds-select"),
  diffSelect:     $("difficulty-select"),
  btnStart:       $("btn-start"),
  hudRound:       $("hud-round"),
  hudScore:       $("hud-score"),
  promptCity:     $("prompt-city"),
  timerBar:       $("timer-bar"),
  roundResult:    $("round-result"),
  resultIcon:     $("result-icon"),
  resultTitle:    $("result-title"),
  resultDistance: $("result-distance"),
  resultPoints:   $("result-points"),
  btnNext:        $("btn-next"),
  endTrophy:      $("end-trophy"),
  endScore:       $("end-score"),
  endMaxScore:    $("end-max-score"),
  endGrade:       $("end-grade"),
  resultsBody:    $("results-body"),
  btnPlayAgain:   $("btn-play-again"),
};

// ─── Utility ─────────────────────────────────────────────────────────────────

/** Haversine great-circle distance in km between two lat/lng pairs. */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Compute points from distance (0–MAX_SCORE_ROUND). */
function pointsFromDistance(km) {
  if (km >= MAX_DIST_KM) return 0;
  // Quadratic falloff: full 5000 at 0 km → 0 at 5000 km
  const ratio = 1 - (km / MAX_DIST_KM);
  return Math.round(MAX_SCORE_ROUND * ratio * ratio);
}

/** Fisher-Yates shuffle (in-place). Returns the array. */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function showScreen(name) {
  ["title", "game", "end"].forEach(n => {
    const el = document.getElementById(`screen-${n}`);
    el.classList.toggle("active", n === name);
  });
}

function formatKm(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${Math.round(km).toLocaleString()} km`;
}

// ─── Map setup ───────────────────────────────────────────────────────────────

function initMap() {
  if (state.map) {
    state.map.remove();
    state.map = null;
  }

  state.map = L.map("map", {
    center:           [20, 10],
    zoom:             2,
    minZoom:          2,
    maxZoom:          8,
    zoomSnap:         0.5,
    worldCopyJump:    false,
    maxBounds:        [[-90, -200], [90, 200]],
    maxBoundsViscosity: 1.0,
  });

  // CartoDB Positron – clean, muted style good for a geo quiz
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 20,
  }).addTo(state.map);

  state.map.on("click", onMapClick);
}

// ─── Game flow ───────────────────────────────────────────────────────────────

function startGame() {
  state.totalRounds  = parseInt(el.roundsSelect.value, 10);
  state.difficulty   = el.diffSelect.value;
  state.currentRound = 0;
  state.score        = 0;
  state.roundResults = [];
  state.awaitingNext = false;

  // Build question list
  const pool = getLocationsByDifficulty(state.difficulty);
  state.questions = shuffle([...pool]).slice(0, state.totalRounds);

  showScreen("game");
  initMap();
  // Give the browser one frame to render the flex layout before Leaflet
  // measures the map container – prevents the "grey/black tiles" bug.
  setTimeout(() => {
    state.map.invalidateSize();
    startRound();
  }, 50);
}

function startRound() {
  state.awaitingNext = false;

  // Clear previous markers / line
  clearMapOverlays();
  el.roundResult.classList.add("hidden");

  const location = state.questions[state.currentRound];
  el.promptCity.textContent = location.name;
  el.hudRound.textContent   = `${state.currentRound + 1} / ${state.totalRounds}`;
  el.hudScore.textContent   = state.score.toLocaleString();

  startTimer();
}

function startTimer() {
  clearInterval(state.timerInterval);
  state.timeLeft = ROUND_TIME_SEC;
  updateTimerBar();

  state.timerInterval = setInterval(() => {
    state.timeLeft -= 0.1;
    updateTimerBar();

    if (state.timeLeft <= 0) {
      clearInterval(state.timerInterval);
      // Time's up – auto-submit with a missed guess far from target
      handleTimesUp();
    }
  }, 100);
}

function updateTimerBar() {
  const pct = Math.max(0, state.timeLeft / ROUND_TIME_SEC) * 100;
  el.timerBar.style.width = `${pct}%`;

  el.timerBar.classList.remove("warning", "danger");
  if (pct < 20) el.timerBar.classList.add("danger");
  else if (pct < 40) el.timerBar.classList.add("warning");
}

function handleTimesUp() {
  clearInterval(state.timerInterval);
  // Show "time's up" result without a guess marker
  const location = state.questions[state.currentRound];
  showRoundResult(null, null, location, Infinity);
}

function onMapClick(e) {
  if (state.awaitingNext) return;

  clearInterval(state.timerInterval);

  const { lat, lng } = e.latlng;
  const location      = state.questions[state.currentRound];
  const distKm        = haversineKm(lat, lng, location.lat, location.lng);

  // Place guess marker
  state.guessMarker = L.circleMarker([lat, lng], {
    radius:      8,
    color:       "#ffffff",
    weight:      3,
    fillColor:   "#4e9af1",
    fillOpacity: 1,
  }).addTo(state.map).bindPopup("Your guess");

  showRoundResult(lat, lng, location, distKm);
}

function showRoundResult(guessLat, guessLng, location, distKm) {
  state.awaitingNext = true;

  const points = isFinite(distKm) ? pointsFromDistance(distKm) : 0;
  state.score += points;
  state.roundResults.push({ name: location.name, distanceKm: distKm, points });

  // Place target marker
  state.targetMarker = L.circleMarker([location.lat, location.lng], {
    radius:      10,
    color:       "#ffffff",
    weight:      3,
    fillColor:   "#2ecc71",
    fillOpacity: 1,
  }).addTo(state.map).bindPopup(`📍 ${location.name}`).openPopup();

  // Draw line between guess and target (if guess exists)
  if (guessLat !== null && isFinite(distKm)) {
    state.guessLine = L.polyline(
      [[guessLat, guessLng], [location.lat, location.lng]],
      { color: "#f39c12", weight: 2, dashArray: "6 4", opacity: 0.8 }
    ).addTo(state.map);

    // Fit map to show both points
    const bounds = L.latLngBounds(
      [guessLat, guessLng],
      [location.lat, location.lng]
    ).pad(0.25);
    state.map.fitBounds(bounds, { animate: true, duration: 0.5 });
  } else {
    // Time's up – zoom to correct location
    state.map.setView([location.lat, location.lng], 4, { animate: true });
  }

  // Populate result card
  if (!isFinite(distKm)) {
    el.resultIcon.textContent  = "⏰";
    el.resultTitle.textContent = "Time's Up!";
    el.resultDistance.textContent = `The answer was: ${location.name}`;
  } else {
    const icon = points >= 4000 ? "🎯" : points >= 2000 ? "👍" : points >= 500 ? "🙂" : "😬";
    el.resultIcon.textContent  = icon;
    el.resultTitle.textContent = points >= 4000 ? "Excellent!" : points >= 2000 ? "Good job!" : points >= 500 ? "Not bad" : "Off the mark";
    el.resultDistance.textContent = `Distance: ${formatKm(distKm)} from ${location.name}`;
  }

  el.resultPoints.textContent = `+${points.toLocaleString()} points`;
  el.resultPoints.style.color = points >= 3000 ? "var(--success)"
                              : points >= 1000 ? "var(--warning)"
                              : "var(--danger)";

  el.hudScore.textContent = state.score.toLocaleString();
  el.roundResult.classList.remove("hidden");
}

function nextRound() {
  state.currentRound++;
  if (state.currentRound >= state.totalRounds) {
    endGame();
  } else {
    startRound();
  }
}

function clearMapOverlays() {
  if (state.guessMarker)  { state.map.removeLayer(state.guessMarker);  state.guessMarker  = null; }
  if (state.targetMarker) { state.map.removeLayer(state.targetMarker); state.targetMarker = null; }
  if (state.guessLine)    { state.map.removeLayer(state.guessLine);    state.guessLine    = null; }
}

// ─── End screen ──────────────────────────────────────────────────────────────

function endGame() {
  clearInterval(state.timerInterval);
  showScreen("end");

  const maxPossible = state.totalRounds * MAX_SCORE_ROUND;
  const pct         = state.score / maxPossible;

  // Trophy emoji + grade text
  const trophy = pct >= 0.9 ? "🏆" : pct >= 0.7 ? "🥇" : pct >= 0.5 ? "🥈" : pct >= 0.3 ? "🥉" : "🌍";
  const grade  = pct >= 0.9 ? "Geography Master!"
               : pct >= 0.7 ? "World Traveller"
               : pct >= 0.5 ? "Decent Navigator"
               : pct >= 0.3 ? "Getting There"
               : "Keep Exploring!";

  el.endTrophy.textContent  = trophy;
  el.endScore.textContent   = state.score.toLocaleString();
  el.endMaxScore.textContent = `out of ${maxPossible.toLocaleString()}`;
  el.endGrade.textContent    = grade;

  // Populate results table
  el.resultsBody.innerHTML = state.roundResults.map((r, i) => {
    const distText  = isFinite(r.distanceKm) ? formatKm(r.distanceKm) : "–";
    const ptClass   = r.points >= 3000 ? "points-high" : r.points >= 1000 ? "points-mid" : "points-low";
    return `<tr>
      <td>${i + 1}</td>
      <td>${r.name}</td>
      <td>${distText}</td>
      <td class="points-cell ${ptClass}">${r.points.toLocaleString()}</td>
    </tr>`;
  }).join("");
}

// ─── Event listeners ─────────────────────────────────────────────────────────

el.btnStart.addEventListener("click", startGame);
el.btnNext.addEventListener("click", nextRound);
el.btnPlayAgain.addEventListener("click", () => showScreen("title"));
