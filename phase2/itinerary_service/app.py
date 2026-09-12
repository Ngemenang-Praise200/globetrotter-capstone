"""Itinerary Service — owns itineraries and validates users through User Service HTTP. Runs on :5003."""
import json, os, secrets
from datetime import datetime, timezone
from pathlib import Path
import requests
from flask import Flask, jsonify, request

app = Flask(__name__); DATA_FILE = Path(__file__).parent / "data" / "itineraries.json"; USER_SERVICE_URL = os.environ.get("USER_SERVICE_URL", "http://localhost:5001")
def entries():
    try: return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError): return []
def save(value): DATA_FILE.write_text(json.dumps(value, indent=2), encoding="utf-8")
def now(): return datetime.now(timezone.utc).isoformat()
def authenticated_user():
    try:
        response = requests.get(f"{USER_SERVICE_URL}/auth/verify", headers={"Authorization": request.headers.get("Authorization", "")}, timeout=3)
        return response.json().get("user") if response.ok else None
    except requests.RequestException: return None
def user_exists(user_id):
    try: return requests.get(f"{USER_SERVICE_URL}/users/{user_id}", timeout=3).ok
    except requests.RequestException: return False
def require_user():
    user = authenticated_user()
    return user or (jsonify({"error": "A valid User Service session is required."}), 401)
def can_view(item, user_id): return item.get("userId") == user_id or user_id in item.get("collaboratorIds", [])
def can_edit(item, user_id): return can_view(item, user_id)  # any collaborator can edit; only the owner can delete (see modify())

@app.get("/health")
def health(): return jsonify({"status": "ok", "service": "itinerary"})

@app.get("/itineraries")
def list_itineraries():
    user = require_user()
    if isinstance(user, tuple): return user
    return jsonify([item for item in entries() if can_view(item, user["id"])])
@app.post("/itineraries")
def create():
    user = require_user()
    if isinstance(user, tuple): return user
    # Explicit HTTP call proves the service never reads User Service data directly.
    if not user_exists(user["id"]): return jsonify({"error": "User Service could not find this user."}), 422
    body = request.get_json(silent=True) or {}
    if not str(body.get("title", "")).strip(): return jsonify({"error": "An itinerary title is required."}), 400
    # A group trip: collaborators can view and edit the itinerary alongside
    # the owner. Each collaborator id is checked against User Service the
    # same way the owner already is, so a bad id fails loudly instead of
    # silently sitting in the list.
    collaborator_ids = []
    for collaborator_id in body.get("collaboratorIds", []):
        collaborator_id = str(collaborator_id).strip()
        if collaborator_id and collaborator_id != user["id"] and user_exists(collaborator_id):
            collaborator_ids.append(collaborator_id)
    all_entries = entries(); item = {"id": secrets.token_urlsafe(10), "userId": user["id"], "title": body["title"].strip(), "destinationIds": body.get("destinationIds", []), "notes": str(body.get("notes", "")), "startDate": body.get("startDate") or None, "endDate": body.get("endDate") or None, "collaboratorIds": collaborator_ids, "createdAt": now(), "updatedAt": now()}; all_entries.append(item); save(all_entries)
    return jsonify(item), 201
@app.route("/itineraries/<item_id>", methods=["PUT", "DELETE"])
def modify(item_id):
    user = require_user()
    if isinstance(user, tuple): return user
    all_entries = entries(); index = next((i for i, item in enumerate(all_entries) if item.get("id") == item_id), None)
    if index is None or not can_view(all_entries[index], user["id"]): return jsonify({"error": "Itinerary not found."}), 404
    if request.method == "DELETE":
        # Any collaborator can edit the shared plan, but only the owner can
        # delete it outright — otherwise one member could wipe out a trip
        # the whole group was building together.
        if all_entries[index].get("userId") != user["id"]:
            return jsonify({"error": "Only the trip owner can delete this itinerary."}), 403
        all_entries.pop(index); save(all_entries); return jsonify({"success": True})
    body = request.get_json(silent=True) or {}
    updates = {key: body[key] for key in ("title", "destinationIds", "notes", "startDate", "endDate") if key in body}
    if "collaboratorIds" in body and all_entries[index].get("userId") == user["id"]:
        # Only the owner can change who's a collaborator, same reasoning as delete.
        updates["collaboratorIds"] = [str(c).strip() for c in body["collaboratorIds"] if str(c).strip() and (str(c).strip() == all_entries[index]["userId"] or user_exists(str(c).strip()))]
    all_entries[index].update(updates); all_entries[index]["updatedAt"] = now(); save(all_entries); return jsonify(all_entries[index])
if __name__ == "__main__": app.run(port=5003, debug=False)
