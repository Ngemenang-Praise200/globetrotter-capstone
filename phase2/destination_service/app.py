"""Destination Service — owns the Bamenda catalogue, plus ratings & reviews. Runs on :5002."""
import json, math, os, secrets
from datetime import datetime, timezone
from pathlib import Path
import requests
from flask import Flask, jsonify, request

app = Flask(__name__)
DATA_FILE = Path(__file__).parent / "data" / "destinations.json"
REVIEWS_FILE = Path(__file__).parent / "data" / "reviews.json"
CENTER = (5.9631, 10.1591)
USER_SERVICE_URL = os.environ.get("USER_SERVICE_URL", "http://localhost:5001")

# Real, locally-hosted photos used as a fallback so a place a traveler finds
# through map search — not yet in the curated catalogue — still shows a
# genuine glimpse of Bamenda, keyed by category. Every one of these was
# either supplied by the project owner or verified as actually taken in
# Bamenda before being added here.
CATEGORY_IMAGES = {
    "culture": {"image": "/mankon-palace-view.jpg", "imageCredit": "Photo provided",
                "imageLabel": "A Bamenda-area cultural landmark shown as an example — not a photo of this exact place"},
    "nature": {"image": "/awing-waterfall.jpg", "imageCredit": "@bamendauptodate",
               "imageLabel": "A Bamenda-area waterfall shown as an example — not a photo of this exact spot"},
    "adventure": {"image": "/bamenda-overview.jpg", "imageCredit": "Photo provided",
                  "imageLabel": "A view over Bamenda shown as an example — not a photo of this exact spot"},
    "relaxation": {"image": "/ayaba-hotel.jpg", "imageCredit": "Photo provided",
                   "imageLabel": "A Bamenda-area hotel shown as an example — not a photo of this exact place"},
    "food": {"image": "/bamenda-overview.jpg", "imageCredit": "Photo provided",
             "imageLabel": "A general Bamenda view shown as an example — not a photo of this exact place"},
    "administrative": {"image": "/bamenda-overview.jpg", "imageCredit": "Photo provided",
                        "imageLabel": "A general Bamenda view shown as an example — not a photo of this exact office"},
}

def places():
    try: return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError): return []
def distance(a, b, c, d):
    r = 6371; x = math.radians(c-a); y = math.radians(d-b); q = math.sin(x/2)**2 + math.cos(math.radians(a))*math.cos(math.radians(c))*math.sin(y/2)**2; return r*2*math.atan2(math.sqrt(q), math.sqrt(1-q))
def with_image(item):
    if not item or item.get("image"): return item
    fallback = CATEGORY_IMAGES.get((item.get("category") or "").lower())
    return {**item, **fallback} if fallback else item

# --- Reviews & ratings -------------------------------------------------
def reviews_all():
    try: return json.loads(REVIEWS_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError): return []
def reviews_save(value):
    REVIEWS_FILE.parent.mkdir(parents=True, exist_ok=True)
    REVIEWS_FILE.write_text(json.dumps(value, indent=2), encoding="utf-8")
def reviews_for(place_id): return [r for r in reviews_all() if r.get("destinationId") == place_id]
def rating_summary(place_id):
    place_reviews = reviews_for(place_id)
    if not place_reviews: return {"averageRating": None, "reviewCount": 0}
    average = sum(r["rating"] for r in place_reviews) / len(place_reviews)
    return {"averageRating": round(average, 1), "reviewCount": len(place_reviews)}
def with_details(item):
    # Ratings apply to every catalogue entry, but the category photo
    # fallback deliberately does NOT — sharing one fallback image across
    # every place lacking its own photo means two different catalogue
    # entries would render pixel-identical pictures. Better to show no
    # photo on those than a duplicate one. The fallback is reserved for
    # `lookup()`'s external branch below, where there's no "other catalogue
    # entry" to collide with.
    return {**item, **rating_summary(item["id"])} if item else item
def authenticated_user():
    # Verify the caller's session against User Service rather than trusting the client —
    # keeps the same "never read another service's data directly" boundary as Itinerary Service.
    try:
        response = requests.get(f"{USER_SERVICE_URL}/auth/verify", headers={"Authorization": request.headers.get("Authorization", "")}, timeout=3)
        return response.json().get("user") if response.ok else None
    except requests.RequestException: return None

@app.get("/health")
def health(): return jsonify({"status": "ok", "service": "destination"})

@app.get("/destinations")
def destinations():
    search = request.args.get("search", "").lower(); category = request.args.get("category", "").lower()
    matches = [p for p in places() if (not category or p.get("category", "").lower() == category) and (not search or search in " ".join([p.get("name", ""), p.get("location", ""), p.get("address", ""), p.get("description", ""), *p.get("tags", [])]).lower())]
    return jsonify([with_details(p) for p in matches])
@app.get("/destinations/<place_id>")
def destination(place_id):
    item = next((p for p in places() if p.get("id") == place_id), None); return (jsonify(with_details(item)), 200) if item else (jsonify({"error": "Destination not found."}), 404)
@app.get("/services")
def services():
    labels = {"food": "Food & Dining", "culture": "Culture & Heritage", "adventure": "Adventure", "relaxation": "Relaxation", "nature": "Nature", "administrative": "Administrative Services"}; all_places = places()
    return jsonify([{"id": key, "title": value, "count": sum(p.get("category") == key for p in all_places), "destinations": [with_details(p) for p in all_places if p.get("category") == key]} for key, value in labels.items()])
@app.get("/nearby")
def nearby():
    try: lat, lon = float(request.args["lat"]), float(request.args["lon"])
    except (KeyError, ValueError): return jsonify({"error": "Valid lat and lon are required."}), 400
    results = [{**with_details(p), "distanceKm": round(distance(lat, lon, p["lat"], p["lon"]), 2)} for p in places() if isinstance(p.get("lat"), (int, float))]
    return jsonify(sorted(results, key=lambda x: x["distanceKm"])[:int(request.args.get("limit", 8))])
@app.get("/place-lookup")
def lookup():
    query = request.args.get("q", "").strip(); local = next((p for p in places() if query.lower() in " ".join([p.get("name", ""), p.get("location", ""), p.get("address", "")]).lower()), None)
    if local: return jsonify({**with_details(local), "source": "catalogue"})
    if len(query) < 2: return jsonify({"error": "Enter a place or area in Bamenda."}), 400
    try: result = requests.get("https://nominatim.openstreetmap.org/search", params={"q": f"{query}, Bamenda, Cameroon", "format": "jsonv2", "limit": 1}, headers={"User-Agent": "GlobeTrotter/2.0"}, timeout=8).json()
    except requests.RequestException: return jsonify({"error": "Place search is temporarily unavailable."}), 502
    if not result: return jsonify({"error": f'No Bamenda location was found for "{query}".'}), 404
    found = result[0]
    external = {"id": f"lookup-{query.lower().replace(' ', '-')}", "name": query.title(), "location": found["display_name"].split(",")[0], "address": found["display_name"], "lat": float(found["lat"]), "lon": float(found["lon"]), "category": "adventure", "tags": ["Bamenda", "lookup"], "description": "Found through OpenStreetMap.", "source": "external"}
    return jsonify(with_image(external))

@app.get("/destinations/<place_id>/reviews")
def get_reviews(place_id):
    if not any(p.get("id") == place_id for p in places()): return jsonify({"error": "Destination not found."}), 404
    return jsonify({"reviews": sorted(reviews_for(place_id), key=lambda r: r["createdAt"], reverse=True), **rating_summary(place_id)})

@app.post("/destinations/<place_id>/reviews")
def add_review(place_id):
    if not any(p.get("id") == place_id for p in places()): return jsonify({"error": "Destination not found."}), 404
    user = authenticated_user()
    if not user: return jsonify({"error": "Please sign in to leave a review."}), 401
    body = request.get_json(silent=True) or {}
    try: rating = int(body.get("rating"))
    except (TypeError, ValueError): return jsonify({"error": "A rating from 1 to 5 is required."}), 400
    if rating < 1 or rating > 5: return jsonify({"error": "Rating must be between 1 and 5."}), 400
    comment = str(body.get("comment", "")).strip()[:500]
    all_reviews = reviews_all()
    review = {"id": secrets.token_urlsafe(8), "destinationId": place_id, "userId": user["id"], "userName": user.get("name", "Traveler"), "rating": rating, "comment": comment, "createdAt": datetime.now(timezone.utc).isoformat()}
    all_reviews.append(review); reviews_save(all_reviews)
    return jsonify(review), 201

if __name__ == "__main__": app.run(port=5002, debug=False)