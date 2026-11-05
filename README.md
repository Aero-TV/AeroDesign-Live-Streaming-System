# AeroDesign - Live Transmission Overlay System

> [!NOTE]
> **Archived.** This was the initial proposed version of the AeroTV broadcast overlay system, but it ended up not being used in the live broadcasts. It is kept here for reference only.

A complete live broadcast overlay system designed for the brazilian AeroDesign competitions, allowing you to display dynamic information over your video stream in OBS.

## 🎯 Features

- **Persistent status bar**: live clock, current weather, short forecast and the atmospheric numbers that decide payload capability
- **Dynamic lower third**: the team on air, their standing, current battery and a countdown to their takeoff window
- **Expandable panel**: open flight results, the standings or the upcoming teams on command
- **Web-based control panel**: run the whole broadcast from one screen
- **OBS integration**: works as a Browser Source, transparent background
- **Web Components**: modular, reusable components for parallel team development

## 📋 What Gets Displayed

### Top bar (always on)

| Element | Detail |
| --- | --- |
| Clock | Ticks locally, unaffected by network hiccups |
| Weather | Condition, temperature, humidity, wind speed and direction, QNH |
| Forecast | Next four hours with rain chance |
| Atmosphere | Density altitude, air density and density relative to sea level |

**Why density altitude matters:** the payload an aircraft can lift scales with air density. A field at 660 m on a 29 °C day behaves like 1420 m — roughly 87% of sea level density. The bar makes that visible to the commentators in real time.

### Lower third (the team on air)

Aircraft photo, team name, university, position in the standings, total score, current battery, and a countdown ring for the takeoff window. The ring escalates from cyan to amber to red as the window closes.

### Expandable panel (on command)

- **Results** — every battery flown, with status, payload and score
- **Standings** — the top of the table, with the team on air highlighted
- **Upcoming** — who flies next, and at what time

## 🏗️ Architecture

```
┌─────────────────┐
│  Control Panel  │ ← You control the broadcast here
│  (Web Browser)  │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  Python Backend │ ← FastAPI server with REST API
│   (Port 8000)   │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  Overlay Page   │ ← Add this as Browser Source in OBS
│  (Polls API)    │
└─────────────────┘
```

The overlay polls a single endpoint (`/api/overlay/state`) that returns everything it draws, keeping the OBS browser source to one request per poll.

### Rendering model

Components separate **structure** from **data**:

- `template()` rebuilds only when `renderKey()` changes (a new team, a different panel)
- `update()` runs on every poll and patches text, attributes and classes in place, doing nothing when a value is unchanged

This matters because the overlay polls twice a second. Replacing the DOM on every poll would restart every CSS animation mid-flight.

### Design system

- `shared/styles/tokens.css` — palette, typography and motion curves as CSS custom properties. They inherit through shadow boundaries, so every component shares one vocabulary.
- `shared/styles/theme.js` — keyframes and the glass panel surface.

Motion rules: nothing blinks. Continuous loops run 2.4s or slower at low amplitude, and `prefers-reduced-motion` is respected.

### Who works where

- **Backend Developer**: `backend/main.py`, `backend/atmosphere.py`
- **UI/UX Developer**: `shared/styles/`, component `styles()`
- **Frontend Logic Developer**: component behaviour and state

## 🚀 Quick Start

### Prerequisites

- Python 3.11 or higher
- UV package manager
- OBS Studio (for broadcasting)
- A modern web browser

### Installation

```bash
git clone git@github.com:rafaellehmkuhl/AeroDesign-Live-Streaming-System.git
cd AeroDesign-Live-Streaming-System
./dev.sh install
```

Notice you need `uv` installed on your system, as it is used for package management on this repository.

### Running

```bash
./dev.sh start      # starts on http://localhost:8000
./dev.sh test       # runs the test suite
```

Then open:

- **Control panel**: http://localhost:8000/control-panel/index.html
- **Overlay preview**: http://localhost:8000/overlay/index.html?dev=1

The `?dev=1` flag draws the 1920x1080 boundary, the title-safe area and a backdrop so you can see the glass panels. **Never use it in OBS** — the production URL has no query string.

Under `?dev=1` the preview also plays `overlay/assets/sample.mp4` behind the overlay, so you can judge contrast against moving footage instead of a flat gradient. Drop your own recording in as that file, or point at another one with `?dev=1&sample=<url>`. The video is only ever given a source in dev mode, so the OBS browser source stays transparent and never fetches it.

## 🎥 Setting Up in OBS

1. Add a **Browser Source** named "AeroDesign Overlay"
2. **URL**: `http://localhost:8000/overlay/index.html`
3. **Width** `1920`, **Height** `1080`
4. Check "Shutdown source when not visible" and "Refresh browser when scene becomes active"
5. Place it above your camera source in the layer list

### Running OBS on a different machine

The overlay resolves the API address rather than assuming localhost. If the backend runs on another machine, point the browser source at it:

```
http://192.168.0.10:8000/overlay/index.html
```

Or serve the page from anywhere and pass the API explicitly:

```
file:///path/to/overlay/index.html?api=http://192.168.0.10:8000
```

## 🎮 Using the Control Panel

| Section | What it does |
| --- | --- |
| **Status** | Whether you are on air, which team, which panel is open |
| **Controles** | Show / hide / toggle, and "next team in the queue" (which also resets the takeoff window) |
| **Janela de decolagem** | Start, pause, reset the countdown; pick a duration preset |
| **Equipe no ar** | Click any team to put them on air |
| **Painel expansível** | Choose which panel the overlay opens |
| **Elementos do overlay** | Toggle individual elements and set the highlight message |
| **Condições do campo** | Edit the readings; derived values recompute server-side |

## 📡 API Endpoints

### Overlay control

- `GET /api/overlay/state` — everything the overlay draws (polled by OBS)
- `PUT /api/overlay/state` — replace the overlay state
- `POST /api/overlay/show?team_id=<id>` — show overlay, optionally switching team
- `POST /api/overlay/hide` / `POST /api/overlay/toggle`
- `POST /api/overlay/panel?panel=none|results|ranking|queue`

### Teams and results

- `GET|POST /api/teams`, `GET|PUT|DELETE /api/teams/{team_id}`
- `POST /api/teams/{team_id}/results` — add or correct a battery result
- `PUT /api/teams/{team_id}/battery?battery_number=<n>`
- `GET /api/ranking?limit=<n>` — standings from validated flights

### Conditions, queue and timer

- `GET|PUT /api/conditions` — field readings; the response adds a `derived` block
- `GET|PUT /api/queue`, `POST /api/queue/advance`
- `GET /api/timer`, `POST /api/timer/start|pause|reset`, `PUT /api/timer`

### Example usage

```bash
# Put a team on air and open their results
curl -X POST "http://localhost:8000/api/overlay/show?team_id=team001"
curl -X POST "http://localhost:8000/api/overlay/panel?panel=results"

# Start their takeoff window
curl -X POST "http://localhost:8000/api/timer/reset?duration_seconds=300"
curl -X POST "http://localhost:8000/api/timer/start"

# Record a flight
curl -X POST "http://localhost:8000/api/teams/team001/results" \
  -H "Content-Type: application/json" \
  -d '{"battery_number": 4, "status": "validated", "score": 88.4, "payload_kg": 9.7}'

# Update the field conditions
curl -X PUT "http://localhost:8000/api/conditions" \
  -H "Content-Type: application/json" \
  -d '{"temperature_c": 31.2, "humidity_pct": 62, "qnh_hpa": 1011,
       "field_elevation_m": 660, "wind_speed_kmh": 18, "wind_direction_deg": 120,
       "condition": "partly_cloudy", "forecast": []}'
```

**Note on read-modify-write:** `GET /api/overlay/state` returns rendering data (the expanded `team`, `conditions`, `ranking`) alongside the writable fields. `PUT` ignores the extras, and `current_team_id` is included precisely so a round trip preserves the selection.

## 🧪 Data and tests

The system ships pre-loaded with 20 teams from the 2025 Classe Regular competition, with sample (fake) flight results, a flight queue and field conditions.

```bash
./dev.sh test
```

Covers the atmospheric math (including hot-day and cold-day density altitude cases) and the API — standings, ties, enum validation, queue advance, timer pause semantics and the state round trip.

## 🔧 Configuration

### Poll interval

Set on the `<api-service>` element:

```html
<api-service auto-poll poll-rate="500"></api-service>
```

Lower values are more responsive and cost more CPU.

### Port

Change it in `backend/main.py` (or pass `--port` to uvicorn). The overlay and control panel follow the origin they were served from, so nothing else needs updating.

## 📁 Project Structure

```
AeroDesign-Live-Streaming-System/
├── backend/
│   ├── main.py                  # FastAPI server and models
│   ├── atmosphere.py            # Air density and density altitude
│   ├── test_atmosphere.py       # Tests for the math
│   ├── test_api.py              # Tests for the endpoints
│   └── mock_data.json           # Teams, queue and field conditions
├── shared/
│   ├── styles/
│   │   ├── tokens.css           # Palette, typography, motion
│   │   └── theme.js             # Keyframes and panel surface
│   └── components/
│       ├── base-component.js    # Structure/data split, patch helpers
│       └── api-service.js       # API access and polling
├── overlay/
│   ├── index.html               # OBS browser source
│   └── components/
│       ├── status-bar.js        # Clock, weather, atmosphere
│       ├── team-lower-third.js  # Team on air + countdown
│       ├── info-panel.js        # Results / standings / upcoming
│       └── custom-message.js    # Announcement banner
├── control-panel/
│   ├── index.html               # Operator interface
│   └── components/
│       ├── status-indicator.js
│       ├── team-card.js
│       ├── control-buttons.js
│       ├── timer-control.js
│       └── notification-toast.js
├── pyproject.toml
└── README.md
```

## 🐛 Troubleshooting

### Overlay not updating in OBS

1. Make sure the backend is running
2. Check the browser source URL
3. Right-click the source → Properties → Refresh cache of current page

### The red dashed frame is showing on air

You are using `?dev=1`. Remove it from the browser source URL.

### Fonts look different on the field machine

The display fonts load from Google Fonts and fall back to a system stack when there is no connectivity. The layout is sized so nothing breaks either way.

### Nothing persists after a restart

State is held in memory. Restarting the server reloads `backend/mock_data.json` and discards live edits.

### CORS errors

CORS is open for all origins in development. Restrict it in the `CORSMiddleware` configuration in `backend/main.py`.

## 🤝 Contributing

Feel free to customize and extend this system for your competition needs!

## 📄 License

This project is open source and available for use in your competitions.

## 🎓 Credits

Built for the AeroDesign competition with ❤️

---

**Need help?** Check the API documentation at `http://localhost:8000/docs` (FastAPI automatic docs)
