import json
import math
import os
import re
import secrets
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any

import bcrypt
import jwt
import requests
from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DESTINATIONS_FILE = DATA_DIR / "destinations.json"
USERS_FILE = DATA_DIR / "users.json"
ITINERARIES_FILE = DATA_DIR / "itineraries.json"
PUBLIC_DIR = BASE_DIR / "public"
JWT_SECRET = os.environ.get("JWT_SECRET", "change-this-secret-before-production")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@globetrotter.local").lower()
# Use a dedicated port so an old development server on 4000 cannot serve stale files.
PORT = int(os.environ.get("PORT", "5050"))
BAMENDA_CENTER = (5.9631, 10.1591)

app = Flask(__name__, static_folder=str(PUBLIC_DIR), static_url_path="")
app.config["JSON_SORT_KEYS"] = False


def read_json(path: Path) -> list[dict[str, Any]]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            value = json.load(handle)
            return value if isinstance(value, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def write_json(path: Path, value: list[dict[str, Any]]) -> None:
    DATA_DIR.mkdir(exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def public_user(user: dict[str, Any]) -> dict[str, Any]:
    return {key: user.get(key) for key in ("id", "name", "email", "interests", "createdAt")} | {"isAdmin": user.get("isAdmin", False) or user.get("email", "").lower() == ADMIN_EMAIL, "sharesLocation": bool(user.get("location"))}


def issue_token(user: dict[str, Any]) -> str:
    return jwt.encode({"id": user["id"], "email": user["email"], "isAdmin": user.get("isAdmin", False)}, JWT_SECRET, algorithm="HS256")


def authenticated(handler):
    @wraps(handler)
    def wrapped(*args, **kwargs):
        token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        if not token:
            return jsonify({"error": "Please sign in to continue."}), 401
        try:
            claims = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        except jwt.PyJWTError:
            return jsonify({"error": "Your session has expired. Please sign in again."}), 401
        user = next((u for u in read_json(USERS_FILE) if u.get("id") == claims.get("id")), None)
        if not user:
            return jsonify({"error": "Account not found."}), 401
        # ADMIN_EMAIL may be configured after the account was created.
        user["isAdmin"] = user.get("isAdmin", False) or user.get("email", "").lower() == ADMIN_EMAIL
        request.current_user = user
        return handler(*args, **kwargs)
    return wrapped


def admin_only(handler):
    @authenticated
    @wraps(handler)
    def wrapped(*args, **kwargs):
        if not request.current_user.get("isAdmin"):
            return jsonify({"error": "Administrator access is required."}), 403
        return handler(*args, **kwargs)
    return wrapped


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    d_lat, d_lon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def estimate_transport(distance: float | None) -> str:
    if distance is None:
        return "Use a shared taxi or moto-taxi; confirm the fare before starting the trip."
    if distance <= 3:
        return "Walk, shared taxi, or moto-taxi (about 100–300 XAF)."
    if distance <= 12:
        return "Shared taxi or moto-taxi (about 200–500 XAF); agree the fare first."
    if distance <= 60:
        return "Use a shared taxi or bus from a Bamenda motor park (about 500–2,000 XAF)."
    return "Use an intercity bus, shared taxi, or private car; confirm fares and road conditions locally."


# Public web photos for places where a verifiable Bamenda image is available.
PLACE_IMAGES = {
    "Bamenda Market": {"image": "https://www-kiva-org.global.ssl.fastly.net/cms//import/fellows_blog_sp_import/the-market3.jpg?w=800", "imageCredit": "Bamenda Food Market photo, Kiva", "imageSource": "https://www.kiva.org/blog/buyem-sellem-the-food-market"},
    "Mankon Square": {"image": "https://commons.wikimedia.org/wiki/Special:FilePath/Commercial%20Avenue%2C%20Bamenda%2C%20Cameroon.jpg?width=900", "imageCredit": "Commercial Avenue, Bamenda — Wikimedia Commons", "imageSource": "https://commons.wikimedia.org/wiki/Category:Views_of_Bamenda"},
    "Mankon Fon's Palace and Museum (Mankon)": {"image": "https://commons.wikimedia.org/wiki/Special:FilePath/Mankon%20Palace%20Museum%2C%20throne.JPG?width=900", "imageCredit": "Mankon Palace Museum — Wikimedia Commons", "imageSource": "https://commons.wikimedia.org/wiki/Category:Thrones_of_Cameroon"},
    "Up Station Area": {"image": "https://commons.wikimedia.org/wiki/Special:FilePath/Bamenda%20from%20mountain%20road.jpg?width=900", "imageCredit": "Bamenda from mountain road — Wikimedia Commons", "imageSource": "https://commons.wikimedia.org/wiki/File:Bamenda_from_mountain_road.jpg"},
}

# Verified public photo of Bamenda, CC BY-SA 3.0 (Dada dada via Wikimedia Commons).
# This is an area-view fallback: it is never presented as a photo of a venue that
# has not yet been individually photographed.
BAMENDA_AREA_VIEW = {
    "image": "https://commons.wikimedia.org/wiki/Special:FilePath/Bamenda%20Commercial%20Ave%20-%20panoramio.jpg?width=1200",
    "imageCredit": "Bamenda Commercial Avenue — Dada dada / Wikimedia Commons (CC BY-SA 3.0)",
    "imageSource": "https://commons.wikimedia.org/wiki/File:Bamenda_Commercial_Ave_-_panoramio.jpg",
    "imageLabel": "Bamenda area view",
}


def area_image_for(*values: Any) -> dict[str, str]:
    """Return a verified Bamenda area view for catalogue and on-the-fly searches."""
    return dict(BAMENDA_AREA_VIEW) if any(str(value or "").strip() for value in values) else {}


def enrich(item: dict[str, Any], origin: tuple[float, float] | None = None) -> dict[str, Any]:
    result = dict(item)
    if item.get("name") in PLACE_IMAGES:
        result.update(PLACE_IMAGES[item["name"]])
    elif not result.get("image") or not result.get("imageCredit") or "source.unsplash.com" in str(result.get("image")):
        result.update(area_image_for(item.get("name"), item.get("location"), item.get("address")))
    # The catalogue is presented as the Bamenda travel guide, including nearby day trips.
    # Keep that scope searchable even where the source entry uses a village name.
    if "bamenda" not in [str(tag).lower() for tag in result.get("tags", [])]:
        result["tags"] = [*result.get("tags", []), "Bamenda"]
    lat, lon = item.get("lat"), item.get("lon")
    distance = None
    if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
        source = origin or BAMENDA_CENTER
        distance = haversine_km(source[0], source[1], lat, lon)
    result["transport"] = item.get("transport") or estimate_transport(distance)
    if item.get("category") == "food":
        result["costEstimate"] = item.get("costEstimate") or "About 1,500–5,000 XAF per plate; confirm the menu price on arrival."
    return result


SERVICE_DEFINITIONS = [
    {"id": "food", "title": "Food & Dining", "description": "Restaurants, cafés, and local food spots.", "icon": "🍽️"},
    {"id": "culture", "title": "Culture & Heritage", "description": "Markets, museums, and landmarks.", "icon": "🏛️"},
    {"id": "adventure", "title": "Adventure", "description": "Trails, viewpoints, and outdoor experiences.", "icon": "🥾"},
    {"id": "relaxation", "title": "Relaxation", "description": "Parks, lounges, and restful places.", "icon": "🌿"},
    {"id": "nature", "title": "Nature", "description": "Waterfalls and green outdoor places.", "icon": "🌊"},
    {"id": "administrative", "title": "Administrative Services", "description": "Public offices and essential services.", "icon": "🏢"},
]

# Approximate centres for the Bamenda areas offered in the registration form.
# Users can still use the place search for any other Bamenda location.
BAMENDA_AREAS = {
    "bamenda city centre": (5.9588, 10.1587), "commercial avenue": (5.9590, 10.1620),
    "mankon": (6.0020, 10.1470), "nkwen": (5.9760, 10.1650), "up station": (5.9605, 10.1600),
    "mile 2": (5.9720, 10.1660), "mile 3": (5.9670, 10.1610), "mile 4": (5.9650, 10.1550),
    "foncha junction": (5.9680, 10.1510), "new road": (5.9580, 10.1490),
    "old town": (5.9560, 10.1555), "ntarikon": (5.9750, 10.1550),
    "mendankwe": (5.9850, 10.1500), "bambui": (5.9900, 10.1700), "bambili": (5.9910, 10.2620),
}


def registered_location(area: str) -> dict[str, Any] | None:
    point = BAMENDA_AREAS.get(area.strip().lower())
    if not point:
        return None
    return {"lat": point[0], "lon": point[1], "area": area.strip(), "updatedAt": now(), "source": "registration"}


@app.get("/")
def home():
    return send_from_directory(PUBLIC_DIR, "index.html")


@app.get("/view")
def city_view():
    return send_from_directory(PUBLIC_DIR, "view.html")


@app.get("/service")
def service_view():
    return send_from_directory(PUBLIC_DIR, "service.html")


@app.get("/itinerary")
def itinerary_view():
    return send_from_directory(PUBLIC_DIR, "itinerary.html")


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/register")
def register():
    body = request.get_json(silent=True) or {}
    name, email, password = (str(body.get(k, "")).strip() for k in ("name", "email", "password"))
    if len(name) < 2 or len(name) > 80:
        return jsonify({"error": "Enter your name (2–80 characters)."}), 400
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        return jsonify({"error": "Enter a valid email address."}), 400
    if len(password) < 8:
        return jsonify({"error": "Use a password with at least 8 characters."}), 400
    area = str(body.get("location", "")).strip()
    location = registered_location(area)
    if not location:
        return jsonify({"error": "Choose a Bamenda area from the location suggestions."}), 400
    if body.get("shareLocation") is not True:
        return jsonify({"error": "Please agree to share this selected location with the administrator."}), 400
    users = read_json(USERS_FILE)
    email = email.lower()
    if any(u.get("email", "").lower() == email for u in users):
        return jsonify({"error": "An account with this email already exists. Please sign in."}), 409
    user = {"id": secrets.token_urlsafe(12), "name": name, "email": email, "password": bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(), "interests": body.get("interests", []), "location": location, "createdAt": now(), "isAdmin": email == ADMIN_EMAIL}
    users.append(user)
    write_json(USERS_FILE, users)
    return jsonify({"token": issue_token(user), "user": public_user(user)}), 201


@app.post("/api/login")
def login():
    body = request.get_json(silent=True) or {}
    email, password = str(body.get("email", "")).strip().lower(), str(body.get("password", ""))
    user = next((u for u in read_json(USERS_FILE) if u.get("email", "").lower() == email), None)
    try:
        valid = user and bcrypt.checkpw(password.encode(), user.get("password", "").encode())
    except ValueError:
        valid = False
    if not valid:
        return jsonify({"error": "Incorrect email or password."}), 401
    return jsonify({"token": issue_token(user), "user": public_user(user)})


@app.get("/api/me")
@authenticated
def me():
    return jsonify(public_user(request.current_user))


@app.get("/api/destinations")
def destinations():
    search, category = (request.args.get("search") or "").lower(), (request.args.get("category") or "").lower()
    matches = []
    for item in read_json(DESTINATIONS_FILE):
        haystack = " ".join([item.get("name", ""), item.get("location", ""), item.get("address", ""), item.get("description", ""), *item.get("tags", [])]).lower()
        if (not search or search in haystack) and (not category or item.get("category", "").lower() == category):
            matches.append(enrich(item))
    return jsonify(matches)


@app.get("/api/destinations/<destination_id>")
def destination(destination_id: str):
    item = next((x for x in read_json(DESTINATIONS_FILE) if x.get("id") == destination_id), None)
    return (jsonify(enrich(item)), 200) if item else (jsonify({"error": "Destination not found."}), 404)


@app.get("/api/services")
def services():
    items = read_json(DESTINATIONS_FILE)
    return jsonify([{
        **service,
        "count": sum(x.get("category") == service["id"] for x in items),
        "destinations": [enrich(x) for x in items if x.get("category") == service["id"]],
    } for service in SERVICE_DEFINITIONS])


@app.get("/api/recommendations")
def recommendations():
    interest = (request.args.get("interest") or "").lower()
    items = read_json(DESTINATIONS_FILE)
    selected = [x for x in items if not interest or x.get("category") == interest or interest in [t.lower() for t in x.get("tags", [])]]
    return jsonify([enrich(x) for x in (selected or items)[:6]])


@app.get("/api/nearby")
def nearby():
    try:
        origin = (float(request.args["lat"]), float(request.args["lon"]))
    except (KeyError, ValueError):
        return jsonify({"error": "Valid lat and lon are required."}), 400
    results = [{**enrich(x, origin), "distanceKm": round(haversine_km(*origin, x["lat"], x["lon"]), 2)} for x in read_json(DESTINATIONS_FILE) if isinstance(x.get("lat"), (int, float)) and isinstance(x.get("lon"), (int, float))]
    return jsonify(sorted(results, key=lambda x: x["distanceKm"])[:8])


@app.get("/api/place-lookup")
def place_lookup():
    query = (request.args.get("q") or "").strip()
    if len(query) < 2:
        return jsonify({"error": "Enter a place or area in Bamenda."}), 400
    local = next((x for x in read_json(DESTINATIONS_FILE) if query.lower() in " ".join([x.get("name", ""), x.get("location", ""), x.get("address", "")]).lower()), None)
    if local:
        return jsonify({**enrich(local), "source": "catalogue"})
    try:
        response = requests.get("https://nominatim.openstreetmap.org/search", params={"q": f"{query}, Bamenda, Cameroon", "format": "jsonv2", "limit": 1, "viewbox": "9.95,6.15,10.40,5.80", "bounded": 1, "accept-language": "en"}, headers={"User-Agent": "GlobeTrotterBamenda/1.0", "Accept-Language": "en"}, timeout=8)
        response.raise_for_status()
        result = response.json()
    except requests.RequestException:
        return jsonify({"error": "Place search is temporarily unavailable. Please try again."}), 502
    if not result:
        return jsonify({"error": f'No Bamenda location was found for "{query}".'}), 404
    match, lat, lon = result[0], float(result[0]["lat"]), float(result[0]["lon"])
    distance = haversine_km(*BAMENDA_CENTER, lat, lon)
    return jsonify({"id": f"lookup-{slugify(query)}", "name": query.title(), "category": "adventure", "tags": ["Bamenda", "lookup"], "location": match["display_name"].split(",")[0], "address": match["display_name"], "description": "This Bamenda location was found through OpenStreetMap. Transport guidance is an estimate; verify locally.", "lat": lat, "lon": lon, "transport": estimate_transport(distance), "distanceFromBamendaKm": round(distance, 1), "source": "external", **area_image_for(query, match.get("display_name"))})


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


@app.get("/api/itineraries")
@authenticated
def list_itineraries():
    return jsonify([x for x in read_json(ITINERARIES_FILE) if x.get("userId") == request.current_user["id"]])


@app.post("/api/itineraries")
@authenticated
def create_itinerary():
    body = request.get_json(silent=True) or {}
    if not str(body.get("title", "")).strip():
        return jsonify({"error": "An itinerary title is required."}), 400
    entries = read_json(ITINERARIES_FILE)
    entry = {"id": secrets.token_urlsafe(10), "userId": request.current_user["id"], "title": body["title"].strip(), "destinationIds": body.get("destinationIds", []), "notes": str(body.get("notes", "")), "startDate": body.get("startDate") or None, "endDate": body.get("endDate") or None, "createdAt": now(), "updatedAt": now()}
    entries.append(entry); write_json(ITINERARIES_FILE, entries)
    return jsonify(entry), 201


@app.put("/api/itineraries/<itinerary_id>")
@authenticated
def update_itinerary(itinerary_id: str):
    entries, body = read_json(ITINERARIES_FILE), request.get_json(silent=True) or {}
    index = next((i for i, x in enumerate(entries) if x.get("id") == itinerary_id and x.get("userId") == request.current_user["id"]), None)
    if index is None: return jsonify({"error": "Itinerary not found."}), 404
    entries[index].update({k: body[k] for k in ("title", "destinationIds", "notes", "startDate", "endDate") if k in body}); entries[index]["updatedAt"] = now(); write_json(ITINERARIES_FILE, entries)
    return jsonify(entries[index])


@app.delete("/api/itineraries/<itinerary_id>")
@authenticated
def delete_itinerary(itinerary_id: str):
    entries = read_json(ITINERARIES_FILE); kept = [x for x in entries if not (x.get("id") == itinerary_id and x.get("userId") == request.current_user["id"])]
    if len(kept) == len(entries): return jsonify({"error": "Itinerary not found."}), 404
    write_json(ITINERARIES_FILE, kept); return jsonify({"success": True})


@app.post("/api/me/location")
@authenticated
def save_location():
    body = request.get_json(silent=True) or {}
    try: lat, lon = float(body["lat"]), float(body["lon"])
    except (KeyError, TypeError, ValueError): return jsonify({"error": "Valid location coordinates are required."}), 400
    if not (-90 <= lat <= 90 and -180 <= lon <= 180): return jsonify({"error": "Invalid location coordinates."}), 400
    users = read_json(USERS_FILE)
    for user in users:
        if user.get("id") == request.current_user["id"]: user["location"] = {"lat": lat, "lon": lon, "updatedAt": now()}
    write_json(USERS_FILE, users); return jsonify({"success": True})


@app.delete("/api/me/location")
@authenticated
def delete_location():
    users = read_json(USERS_FILE)
    for user in users:
        if user.get("id") == request.current_user["id"]: user.pop("location", None)
    write_json(USERS_FILE, users); return jsonify({"success": True})


@app.get("/api/admin/locations")
@admin_only
def admin_locations():
    return jsonify([{"id": u.get("id"), "name": u.get("name"), "location": u["location"]} for u in read_json(USERS_FILE) if u.get("location")])


@app.get("/admin")
def admin_page():
    return send_from_directory(PUBLIC_DIR, "admin.html")


@app.errorhandler(404)
def not_found(_error):
    return jsonify({"error": "Not found."}), 404


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=False)
