"""Recommendation Service — composes User and Destination APIs over HTTP. Runs on :5004."""
import os
import requests
from flask import Flask, jsonify, request

app = Flask(__name__); USER_SERVICE_URL = os.environ.get("USER_SERVICE_URL", "http://localhost:5001"); DESTINATION_SERVICE_URL = os.environ.get("DESTINATION_SERVICE_URL", "http://localhost:5002")

@app.get("/health")
def health(): return jsonify({"status": "ok", "service": "recommendation"})

@app.get("/recommendations")
def recommendations():
    interest = request.args.get("interest", "").lower(); user_id = request.args.get("userId", "")
    try:
        if user_id:
            user_response = requests.get(f"{USER_SERVICE_URL}/users/{user_id}", timeout=3)
            if user_response.ok and not interest: interest = (user_response.json().get("interests") or [""])[0].lower()
        places_response = requests.get(f"{DESTINATION_SERVICE_URL}/destinations", timeout=3); places_response.raise_for_status(); places = places_response.json()
    except requests.RequestException: return jsonify({"error": "A dependent service is unavailable."}), 503
    matching = [place for place in places if not interest or place.get("category", "").lower() == interest or interest in [tag.lower() for tag in place.get("tags", [])]]
    return jsonify((matching or places)[:6])
if __name__ == "__main__": app.run(port=5004, debug=False)
