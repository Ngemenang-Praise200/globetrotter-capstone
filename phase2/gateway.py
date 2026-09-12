"""Phase 2 web gateway: serves the UI and proxies API calls to independent services. Runs on :5050."""
import os
from pathlib import Path
import requests
from flask import Flask, Response, jsonify, request, send_from_directory

ROOT = Path(__file__).resolve().parent.parent; PUBLIC = ROOT / "public"; app = Flask(__name__, static_folder=str(PUBLIC), static_url_path="")
SERVICES = {"user": os.environ.get("USER_SERVICE_URL", "http://localhost:5001"), "destination": os.environ.get("DESTINATION_SERVICE_URL", "http://localhost:5002"), "itinerary": os.environ.get("ITINERARY_SERVICE_URL", "http://localhost:5003"), "recommendation": os.environ.get("RECOMMENDATION_SERVICE_URL", "http://localhost:5004"), "assistant": os.environ.get("ASSISTANT_SERVICE_URL", "http://localhost:5005")}
USER_PATHS = {"register": "/auth/register", "login": "/auth/login", "me": "/me", "me/location": "/me/location", "me/area": "/me/area", "admin/locations": "/admin/locations"}
DESTINATION_PATHS = {"destinations": "/destinations", "services": "/services", "nearby": "/nearby", "place-lookup": "/place-lookup"}
def proxy(service, path):
    try:
        response = requests.request(request.method, f"{SERVICES[service]}{path}", params=request.args, data=request.get_data(), headers={key: value for key, value in request.headers if key.lower() in {"authorization", "content-type"}}, timeout=10)
        return Response(response.content, status=response.status_code, content_type=response.headers.get("content-type", "application/json"))
    except requests.RequestException: return jsonify({"error": f"{service.title()} Service is unavailable."}), 503
@app.route("/api/<path:api_path>", methods=["GET", "POST", "PUT", "DELETE"])
def api(api_path):
    if api_path in USER_PATHS: return proxy("user", USER_PATHS[api_path])
    if api_path == "me/favorites" or api_path.startswith("me/favorites/"): return proxy("user", "/" + api_path)
    if api_path == "assistant/ask": return proxy("assistant", "/ask")
    if api_path == "recommendations": return proxy("recommendation", "/recommendations")
    if api_path == "itineraries" or api_path.startswith("itineraries/"): return proxy("itinerary", "/" + api_path)
    root = api_path.split("/")[0]
    if root in DESTINATION_PATHS: return proxy("destination", "/" + api_path)
    return jsonify({"error": "Not found."}), 404
@app.get("/api/health")
def health(): return jsonify({"status": "ok", "service": "Phase 2 gateway"})
@app.get("/")
def home(): return send_from_directory(PUBLIC, "index.html")
@app.get("/admin")
def admin(): return send_from_directory(PUBLIC, "admin.html")
@app.get("/view")
def view(): return send_from_directory(PUBLIC, "view.html")
@app.get("/service")
def service(): return send_from_directory(PUBLIC, "service.html")
@app.get("/itinerary")
def itinerary(): return send_from_directory(PUBLIC, "itinerary.html")
if __name__ == "__main__": app.run(port=5050, debug=False)
