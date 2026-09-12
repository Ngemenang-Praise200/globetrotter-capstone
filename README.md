# GlobeTrotter Bamenda — updated project

This folder contains **two runnable versions** of the app:

## 1. `app.py` + `public/` + `data/` — the main app (use this now)
The single Flask app you already had, with the new features added:

- **Administrative services** (police, government offices, city council, fire
  service, immigration) added as a new service category alongside food,
  culture, adventure, relaxation, and nature.
- **"Find places near me"** button on the dashboard map uses the browser's
  geolocation, plots your position, and calls `/api/nearby` to rank the
  catalogue by real distance from you.
- **Click any place** (map marker or card) to open a details modal with the
  full description, address, highlights, and — where available — a food-cost
  note and how to get there.
- **Search any place**, catalogued or not: `/api/place-lookup?q=...` checks
  the local catalogue first, then falls back to OpenStreetMap's free
  Nominatim geocoder so a typed place always resolves to a real address and
  coordinates. Cost and transport info for these looked-up places is clearly
  labeled as general guidance (not confirmed data), since there's no free API
  for live menu prices or bus schedules — the fields exist and are populated
  with sensible defaults so they're ready to be replaced with verified data
  later.
- Visual refresh: a serif/sans type pairing (Fraunces + Inter), a details
  modal, and small polish passes — the page structure and functionality are
  unchanged.

Run it the same way as before: `pip install -r requirements.txt` then
`python app.py` (now also depends on `requests`, used for the geocoding
fallback).

## 2. `phase2/` — split into independent, containerized services
A scaffold for Phase 2 that splits the monolith into four containers that
each run and can be redeployed independently:

- `auth-service` (port 4001) — registration, login, `/api/me`, owns `users.json`
- `destinations-service` (port 4002) — search, services, recommendations,
  nearby, and place-lookup, owns `destinations.json`
- `itinerary-service` (port 4003) — itinerary CRUD, owns `itineraries.json`
- `gateway` (nginx, port 8080) — serves the frontend and routes `/api/*` to
  the right service

Services don't call each other over the network: `itinerary-service` and
`auth-service` both trust the same signed JWT (`JWT_SECRET`), so an itinerary
request never needs to phone the auth service to check who's asking. That's
what lets each container scale, restart, or redeploy on its own.

Run it with:

```
cd phase2
docker compose up --build
```

Then open `http://localhost:8080`. Set a real `JWT_SECRET` env var in
production — the default here is only a placeholder shared across services.

### Notes / next steps for phase 2
- Data is currently JSON files on a mounted volume per service, matching how
  the original app stored data. For real concurrent traffic, swap each
  service's JSON file for its own database (e.g. Postgres per service, or at
  least one shared Postgres with separate schemas) — the JSON-file approach
  doesn't handle concurrent writes safely.
- The gateway is a plain nginx reverse proxy. Add TLS, rate limiting, and
  auth-at-the-edge there before exposing this publicly.