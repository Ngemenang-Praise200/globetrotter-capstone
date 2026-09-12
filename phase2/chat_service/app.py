"""Chat Service — direct messages and groups, so account holders can find each
other and plan trips together. Runs on :5006."""
import json, os, secrets
from datetime import datetime, timezone
from pathlib import Path
import requests
from flask import Flask, jsonify, request

app = Flask(__name__)
CONVERSATIONS_FILE = Path(__file__).parent / "data" / "conversations.json"
MESSAGES_FILE = Path(__file__).parent / "data" / "messages.json"
USER_SERVICE_URL = os.environ.get("USER_SERVICE_URL", "http://localhost:5001")


def now(): return datetime.now(timezone.utc).isoformat()


def read_json(path):
    try: return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError): return []


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2), encoding="utf-8")


def conversations(): return read_json(CONVERSATIONS_FILE)
def save_conversations(value): write_json(CONVERSATIONS_FILE, value)
def messages(): return read_json(MESSAGES_FILE)
def save_messages(value): write_json(MESSAGES_FILE, value)


def authenticated_user():
    # Verify the caller's session against User Service, the same pattern
    # Itinerary Service and Destination Service already use — Chat Service
    # never reads user records directly.
    try:
        response = requests.get(f"{USER_SERVICE_URL}/auth/verify", headers={"Authorization": request.headers.get("Authorization", "")}, timeout=3)
        return response.json().get("user") if response.ok else None
    except requests.RequestException:
        return None


def require_user():
    user = authenticated_user()
    return user or (jsonify({"error": "Please sign in to continue."}), 401)


def user_exists(user_id):
    try: return requests.get(f"{USER_SERVICE_URL}/users/{user_id}", timeout=3).ok
    except requests.RequestException: return False


def conversation_for(conversation_id, member_id):
    conv = next((c for c in conversations() if c.get("id") == conversation_id), None)
    if not conv or member_id not in conv.get("memberIds", []):
        return None
    return conv


def last_message_for(conversation_id):
    matching = [m for m in messages() if m.get("conversationId") == conversation_id]
    return matching[-1] if matching else None


@app.get("/health")
def health(): return jsonify({"status": "ok", "service": "chat"})


@app.get("/conversations")
def list_conversations():
    user = require_user()
    if isinstance(user, tuple): return user
    mine = [c for c in conversations() if user["id"] in c.get("memberIds", [])]
    result = []
    for conv in mine:
        last = last_message_for(conv["id"])
        result.append({**conv, "lastMessage": last})
    result.sort(key=lambda c: (c["lastMessage"]["createdAt"] if c.get("lastMessage") else c["createdAt"]), reverse=True)
    return jsonify(result)


@app.post("/conversations")
def create_conversation():
    user = require_user()
    if isinstance(user, tuple): return user
    body = request.get_json(silent=True) or {}
    kind = body.get("type") if body.get("type") in ("direct", "group") else "direct"
    member_ids = [str(m) for m in body.get("memberIds", []) if str(m).strip()]
    member_ids = list(dict.fromkeys([user["id"], *member_ids]))  # de-dupe, keep order, always include self

    if kind == "direct":
        if len(member_ids) != 2:
            return jsonify({"error": "A direct conversation needs exactly one other person."}), 400
        other_id = next(m for m in member_ids if m != user["id"])
        if not user_exists(other_id):
            return jsonify({"error": "That user could not be found."}), 404
        # Re-use an existing direct conversation between the same two people
        # instead of creating duplicates every time someone hits "Message."
        existing = next((c for c in conversations() if c.get("type") == "direct" and set(c.get("memberIds", [])) == set(member_ids)), None)
        if existing:
            return jsonify(existing), 200
    else:
        if len(member_ids) < 2:
            return jsonify({"error": "A group needs at least one other member."}), 400
        for member_id in member_ids:
            if member_id != user["id"] and not user_exists(member_id):
                return jsonify({"error": f"User {member_id} could not be found."}), 404
        name = str(body.get("name", "")).strip()
        if not name:
            return jsonify({"error": "Give the group a name."}), 400

    all_conversations = conversations()
    conv = {
        "id": secrets.token_urlsafe(10),
        "type": kind,
        "name": str(body.get("name", "")).strip() if kind == "group" else None,
        "memberIds": member_ids,
        "createdBy": user["id"],
        "itineraryId": None,
        "createdAt": now(),
    }
    all_conversations.append(conv)
    save_conversations(all_conversations)
    return jsonify(conv), 201


@app.get("/conversations/<conversation_id>/messages")
def get_messages(conversation_id):
    user = require_user()
    if isinstance(user, tuple): return user
    if not conversation_for(conversation_id, user["id"]):
        return jsonify({"error": "Conversation not found."}), 404
    thread = [m for m in messages() if m.get("conversationId") == conversation_id]
    return jsonify(thread)


@app.post("/conversations/<conversation_id>/messages")
def send_message(conversation_id):
    user = require_user()
    if isinstance(user, tuple): return user
    if not conversation_for(conversation_id, user["id"]):
        return jsonify({"error": "Conversation not found."}), 404
    body = request.get_json(silent=True) or {}
    text = str(body.get("text", "")).strip()[:2000]
    if not text:
        return jsonify({"error": "Write something to send."}), 400
    all_messages = messages()
    message = {"id": secrets.token_urlsafe(10), "conversationId": conversation_id, "senderId": user["id"], "senderName": user.get("name", "Traveler"), "text": text, "createdAt": now()}
    all_messages.append(message)
    save_messages(all_messages)
    return jsonify(message), 201


@app.post("/conversations/<conversation_id>/members")
def add_member(conversation_id):
    user = require_user()
    if isinstance(user, tuple): return user
    all_conversations = conversations()
    conv = next((c for c in all_conversations if c.get("id") == conversation_id), None)
    if not conv or user["id"] not in conv.get("memberIds", []):
        return jsonify({"error": "Conversation not found."}), 404
    if conv["type"] != "group":
        return jsonify({"error": "Only groups can have members added."}), 400
    body = request.get_json(silent=True) or {}
    new_member_id = str(body.get("userId", "")).strip()
    if not new_member_id or not user_exists(new_member_id):
        return jsonify({"error": "That user could not be found."}), 404
    if new_member_id not in conv["memberIds"]:
        conv["memberIds"].append(new_member_id)
        save_conversations(all_conversations)
    return jsonify(conv)


@app.delete("/conversations/<conversation_id>/members/<member_id>")
def remove_member(conversation_id, member_id):
    user = require_user()
    if isinstance(user, tuple): return user
    all_conversations = conversations()
    conv = next((c for c in all_conversations if c.get("id") == conversation_id), None)
    if not conv or user["id"] not in conv.get("memberIds", []):
        return jsonify({"error": "Conversation not found."}), 404
    if conv["type"] != "group":
        return jsonify({"error": "Only groups support removing members."}), 400
    # Anyone in the group can remove themselves (leave); only the creator can remove someone else.
    if member_id != user["id"] and user["id"] != conv.get("createdBy"):
        return jsonify({"error": "Only the group creator can remove other members."}), 403
    conv["memberIds"] = [m for m in conv["memberIds"] if m != member_id]
    save_conversations(all_conversations)
    return jsonify(conv)


@app.post("/conversations/<conversation_id>/itinerary")
def link_itinerary(conversation_id):
    # Records which shared itinerary a group is planning — the itinerary
    # itself is created and owned by Itinerary Service; this just links it
    # to the conversation so the group's chat can jump straight to it.
    user = require_user()
    if isinstance(user, tuple): return user
    all_conversations = conversations()
    conv = next((c for c in all_conversations if c.get("id") == conversation_id), None)
    if not conv or user["id"] not in conv.get("memberIds", []):
        return jsonify({"error": "Conversation not found."}), 404
    body = request.get_json(silent=True) or {}
    itinerary_id = str(body.get("itineraryId", "")).strip()
    if not itinerary_id:
        return jsonify({"error": "An itineraryId is required."}), 400
    conv["itineraryId"] = itinerary_id
    save_conversations(all_conversations)
    return jsonify(conv)


if __name__ == "__main__": app.run(port=5006, debug=False)
