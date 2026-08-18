"""User Service — owns user accounts and consented locations. Runs on :5001."""
import json, os, secrets
from datetime import datetime, timezone
from pathlib import Path

import bcrypt, jwt
from flask import Flask, jsonify, request

app = Flask(__name__)
DATA_FILE = Path(__file__).parent / "data" / "users.json"
JWT_SECRET = os.environ.get("JWT_SECRET", "change-this-secret-before-production")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@globetrotter.local").lower()
AREAS = {"bamenda city centre": (5.9588, 10.1587), "commercial avenue": (5.959, 10.162), "mankon": (6.002, 10.147), "nkwen": (5.976, 10.165), "up station": (5.9605, 10.16), "mile 2": (5.972, 10.166), "mile 3": (5.967, 10.161), "mile 4": (5.965, 10.155), "foncha junction": (5.968, 10.151), "new road": (5.958, 10.149), "old town": (5.956, 10.1555), "ntarikon": (5.975, 10.155), "mendankwe": (5.985, 10.15), "bambui": (5.99, 10.17), "bambili": (5.991, 10.262)}

def read_users():
    try: return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError): return []
def write_users(users):
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True); DATA_FILE.write_text(json.dumps(users, indent=2), encoding="utf-8")
def now(): return datetime.now(timezone.utc).isoformat()
def is_admin(user): return bool(user.get("isAdmin")) or user.get("email", "").lower() == ADMIN_EMAIL
def public(user):
    # "area" is the user's own account data, returned only to themselves via
    # authenticated /me-style endpoints — always available for the app's own
    # map/personalization use. "sharesLocation" is a *separate* concern: it
    # only reflects whether an admin is allowed to see it (visibleToAdmin).
    location = user.get("location") or {}
    area = {"name": location.get("area"), "lat": location.get("lat"), "lon": location.get("lon")} if location.get("area") else None
    return {"id": user.get("id"), "name": user.get("name"), "email": user.get("email"), "interests": user.get("interests", []), "createdAt": user.get("createdAt"), "isAdmin": is_admin(user), "sharesLocation": bool(location.get("visibleToAdmin")), "area": area, "favorites": user.get("favorites", [])}
def token_for(user): return jwt.encode({"id": user["id"]}, JWT_SECRET, algorithm="HS256")
def current_user():
    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    try: claims = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError: return None
    return next((u for u in read_users() if u.get("id") == claims.get("id")), None)
def require_user():
    user = current_user()
    return user or (jsonify({"error": "Please sign in to continue."}), 401)

@app.get("/health")
def health(): return jsonify({"status": "ok", "service": "user"})

@app.post("/auth/register")
def register():
    body = request.get_json(silent=True) or {}; name = str(body.get("name", "")).strip(); email = str(body.get("email", "")).strip().lower(); password = str(body.get("password", "")); area = str(body.get("location", "")).strip()
    if len(name) < 2 or "@" not in email or len(password) < 8: return jsonify({"error": "Name, valid email, and an 8-character password are required."}), 400
    users = read_users()
    if any(u.get("email", "").lower() == email for u in users): return jsonify({"error": "An account with this email already exists."}), 409
    user = {"id": secrets.token_urlsafe(12), "name": name, "email": email, "password": bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(), "interests": body.get("interests", []), "createdAt": now(), "isAdmin": email == ADMIN_EMAIL}
    # Picking a Bamenda area is stored whenever given — the app needs it to
    # show you on your own map. Whether an ADMIN can also see it is a fully
    # separate, opt-in choice (visibleToAdmin), controlled by the consent
    # checkbox. Neither is required to create an account.
    point = AREAS.get(area.lower())
    if point:
        user["location"] = {"lat": point[0], "lon": point[1], "area": area, "source": "registration", "updatedAt": now(), "visibleToAdmin": body.get("shareLocation") is True}
    users.append(user); write_users(users); return jsonify({"token": token_for(user), "user": public(user)}), 201

@app.post("/auth/login")
def login():
    body = request.get_json(silent=True) or {}; email = str(body.get("email", "")).strip().lower(); password = str(body.get("password", "")); user = next((u for u in read_users() if u.get("email", "").lower() == email), None)
    if not user or not bcrypt.checkpw(password.encode(), user.get("password", "").encode()): return jsonify({"error": "Incorrect email or password."}), 401
    return jsonify({"token": token_for(user), "user": public(user)})

@app.get("/auth/verify")
def verify():
    user = current_user()
    return (jsonify({"user": public(user)}), 200) if user else (jsonify({"error": "Invalid session."}), 401)
@app.get("/users/<user_id>")
def get_user(user_id):
    user = next((u for u in read_users() if u.get("id") == user_id), None)
    return (jsonify(public(user)), 200) if user else (jsonify({"error": "User not found."}), 404)
@app.get("/me")
def me():
    user = current_user(); return (jsonify(public(user)), 200) if user else (jsonify({"error": "Please sign in to continue."}), 401)

@app.post("/me/area")
def update_area():
    user = current_user()
    if not user: return jsonify({"error": "Please sign in to continue."}), 401
    body = request.get_json(silent=True) or {}
    area = str(body.get("area", "")).strip()
    point = AREAS.get(area.lower())
    if not point: return jsonify({"error": "Choose a listed Bamenda area."}), 400
    users = read_users(); stored = next(u for u in users if u.get("id") == user["id"])
    stored["location"] = {"lat": point[0], "lon": point[1], "area": area, "source": "registration", "updatedAt": now(), "visibleToAdmin": body.get("shareLocation") is True}
    write_users(users)
    return jsonify(public(stored))

@app.route("/me/location", methods=["POST", "DELETE"])
def location():
    user = current_user()
    if not user: return jsonify({"error": "Please sign in to continue."}), 401
    users = read_users(); stored = next(u for u in users if u.get("id") == user["id"])
    if request.method == "DELETE":
        # Turning sharing off only revokes admin visibility — it does not
        # erase the area the user picked at registration, since that's used
        # for the app's own map, not for admins.
        if stored.get("location"): stored["location"]["visibleToAdmin"] = False
    else:
        body = request.get_json(silent=True) or {}
        try: lat, lon = float(body["lat"]), float(body["lon"])
        except (KeyError, TypeError, ValueError): return jsonify({"error": "Valid location coordinates are required."}), 400
        stored["location"] = {"lat": lat, "lon": lon, "updatedAt": now(), "source": "live", "visibleToAdmin": True}
    write_users(users); return jsonify({"success": True})

@app.get("/me/favorites")
def get_favorites():
    user = current_user()
    if not user: return jsonify({"error": "Please sign in to continue."}), 401
    return jsonify(user.get("favorites", []))

@app.post("/me/favorites")
def add_favorite():
    user = current_user()
    if not user: return jsonify({"error": "Please sign in to continue."}), 401
    body = request.get_json(silent=True) or {}
    destination_id = str(body.get("destinationId", "")).strip()
    if not destination_id: return jsonify({"error": "A destinationId is required."}), 400
    users = read_users(); stored = next(u for u in users if u.get("id") == user["id"])
    favorites = stored.setdefault("favorites", [])
    if destination_id not in favorites: favorites.append(destination_id)
    write_users(users); return jsonify({"favorites": favorites})

@app.delete("/me/favorites/<destination_id>")
def remove_favorite(destination_id):
    user = current_user()
    if not user: return jsonify({"error": "Please sign in to continue."}), 401
    users = read_users(); stored = next(u for u in users if u.get("id") == user["id"])
    stored["favorites"] = [d for d in stored.get("favorites", []) if d != destination_id]
    write_users(users); return jsonify({"favorites": stored["favorites"]})

@app.get("/admin/locations")
def admin_locations():
    user = current_user()
    if not user or not is_admin(user): return jsonify({"error": "Administrator access is required."}), 403
    return jsonify([{"id": u.get("id"), "name": u.get("name"), "location": u["location"]} for u in read_users() if u.get("location", {}).get("visibleToAdmin")])

if __name__ == "__main__": app.run(port=5001, debug=False)