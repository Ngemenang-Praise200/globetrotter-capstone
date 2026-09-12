# GlobeTrotter Phase 2 — HTTP microservices

This phase has no Docker or containers. The easiest way to start it is one command:

```powershell
.\.venv\Scripts\python.exe phase2/run_all.py
```

Keep that terminal open, then open **http://127.0.0.1:5050/** in your browser. Press `Ctrl+C` in that terminal to stop every service.

Do not open ports 5001–5004 in a browser expecting a webpage: they are backend REST APIs and may return 404 at `/`. They are included below for learning and testing.

To start every service manually instead, use five terminals:

```powershell
python phase2/user_service/app.py
python phase2/destination_service/app.py
python phase2/itinerary_service/app.py
python phase2/recommendation_service/app.py
python phase2/gateway.py
```

Open `http://localhost:5050`.

| Service | Port | Owns | HTTP dependency |
| --- | ---: | --- | --- |
| User Service | 5001 | `user_service/data/users.json`; authentication, shared locations, and favorites/wishlist | — |
| Destination Service | 5002 | `destination_service/data/destinations.json` and `data/reviews.json`; search, nearby places, ratings & reviews | User Service `/auth/verify` (to attribute reviews to a signed-in user) |
| Itinerary Service | 5003 | `itinerary_service/data/itineraries.json` | User Service `/auth/verify` and `/users/:id` |
| Recommendation Service | 5004 | Recommendation composition logic (no shared data) | User and Destination Services |
| Gateway | 5050 | Static frontend and API forwarding only | All four services |

### New in this pass: favorites and ratings & reviews

- **Favorites/wishlist** — `GET/POST /me/favorites`, `DELETE /me/favorites/<id>` on
  User Service (proxied at `/api/me/favorites`). A signed-in traveler can save or
  remove a destination from the place modal; the list is stored per-user in
  `users.json`.
- **Ratings & reviews** — `GET/POST /destinations/<id>/reviews` on Destination
  Service (proxied at `/api/destinations/<id>/reviews`), backed by the new
  `destination_service/data/reviews.json`. Every destination response now
  includes `averageRating` and `reviewCount`, computed on the fly. Posting a
  review requires a valid User Service session, verified the same way
  Itinerary Service verifies itinerary ownership.

Every service also now exposes `GET /health` (used by the new Docker
`HEALTHCHECK` instructions and by cloud platforms to know an instance is
ready before routing traffic to it — see `DEPLOYMENT.md`).

The gateway never opens another service's JSON file. The Itinerary Service validates its owner with `GET /auth/verify` and confirms the account with `GET /users/<id>`. The Recommendation Service obtains interests and places through REST calls. These calls are deliberately visible in the source to demonstrate Phase 2 boundaries.
