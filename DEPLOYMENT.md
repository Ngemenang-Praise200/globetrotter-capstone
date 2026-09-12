# Phase 3 Deployment Guide

## 1. Test locally with Docker first

From the project root (the `GlobalTrotter/` folder, next to `docker-compose.yml`):

```bash
docker compose up --build
```

This builds all 5 containers (user, destination, itinerary, recommendation,
gateway) and wires them together on a private Docker network, using the
same environment variables (`USER_SERVICE_URL`, etc.) the code already
reads via `os.environ.get(...)`. Visit `http://localhost:5050` — same app
as `phase2/run_all.py` gave you, just now every service is in its own
container instead of a shared Python process.

Check each service is healthy:
```bash
curl http://localhost:5001/health
curl http://localhost:5002/health
curl http://localhost:5003/health
curl http://localhost:5004/health
curl http://localhost:5050/api/health
```

Your existing `phase2/*/data/*.json` files are mounted into the
containers as Docker volumes (see `docker-compose.yml`), so your real
data is used — nothing is duplicated or reset by containerizing.

## 2. Picking a platform

All three (Render, Railway, Fly.io) can build directly from your
Dockerfiles and give you load balancing + auto-scaling through dashboard
settings, not code. For a first deployment, **Render** is the least
fiddly — each service becomes a separate "Web Service" with its own URL.

## 3. Deploying to Render

1. Push this project to a GitHub repo.
2. Create **5 separate Web Services**, each pointing at the same repo:

   | Service | Dockerfile path | Root/context |
   |---|---|---|
   | user-service | `phase2/user_service/Dockerfile` | repo root, but build context `phase2/` |
   | destination-service | `phase2/destination_service/Dockerfile` | build context `phase2/` |
   | itinerary-service | `phase2/itinerary_service/Dockerfile` | build context `phase2/` |
   | recommendation-service | `phase2/recommendation_service/Dockerfile` | build context `phase2/` |
   | gateway | `phase2/gateway.Dockerfile` | build context repo root (needs `public/`) |

   Render lets you set "Docker Build Context Directory" separately from
   the Dockerfile path — set that to `phase2` for the first four, and
   leave it as the repo root for the gateway.

3. For each service, set env vars pointing at the real Render URLs once
   the other services exist (e.g. `USER_SERVICE_URL=https://your-user-service.onrender.com`).
   Create user-service and destination-service first, copy their URLs,
   then set them on itinerary-service, recommendation-service, and gateway.
4. Set `JWT_SECRET` on user-service to a real random secret in production.

## 4. Load balancing

You don't write any load-balancing code. Once a Render/Railway/Fly
service has more than one instance running, the platform's router
distributes requests across them automatically.

## 5. Auto-scaling — and the important caveat

In each service's **Settings → Scaling**, set a min/max instance count
and a trigger (CPU % or request count) — that's the whole feature, no
code needed.

**Only turn this on for `destination-service`, `recommendation-service`,
and `gateway`.** `user-service` and `itinerary-service` write to local
JSON files on their own disk — if either runs as 2+ instances, each
instance gets its own separate copy of that file, so a user registered
on instance A won't exist on instance B. Keep those two pinned to a
single instance until they're backed by a real shared database (Render
and Railway both offer managed Postgres — worth doing as a follow-up,
not required to finish Phase 3).

`destination-service` only *reads* its files, so it's safe to scale
freely. `recommendation-service` and `gateway` don't store anything
locally at all.
