"""Assistant Service — a lightweight Bamenda travel concierge. Runs on :5005.

This is a rule-based assistant, not a call to an external AI provider: it
matches keywords in the traveler's question against the Destination Service
catalogue and a small set of general Bamenda travel tips, then composes a
plain-language answer. No API key or third-party AI service is needed, so
the whole app stays runnable offline/locally without extra setup or cost.
"""
import os
import requests
from flask import Flask, jsonify, request

app = Flask(__name__)
DESTINATION_SERVICE_URL = os.environ.get("DESTINATION_SERVICE_URL", "http://localhost:5002")

FAQ_KEYWORDS = {
    "currency": ("money", "currency", "xaf", "cfa", "cost", "afford", "budget", "cash", "atm"),
    "language": ("language", "speak", "english", "pidgin", "french"),
    "safety": ("safe", "safety", "danger", "risk", "crime", "night"),
    "transport": ("transport", "taxi", "moto", "bike", "get around", "getting around", "bus"),
    "weather": ("weather", "rain", "season", "when to visit", "best time", "climate", "temperature"),
}

FAQ_ANSWERS = {
    "currency": "Bamenda uses the Central African CFA franc (XAF). Cards are accepted at very few places outside major hotels, so carry cash — ATMs are available around Commercial Avenue and City Centre.",
    "language": "English is the main language in Bamenda, since it's in Cameroon's Anglophone Northwest Region. Cameroonian Pidgin English is widely spoken day-to-day, alongside local languages like Mankon and Nkwen in their respective quarters.",
    "safety": "Bamenda is generally welcoming to visitors. As anywhere, stick to well-traveled, well-lit areas at night, avoid displaying valuables, and keep a copy of your ID separate from the original.",
    "transport": "Shared taxis (\"clandos\") and moto-taxis are the most common way to get around; agree on the fare before getting in. Check a place's own \"Getting there\" notes for specifics.",
    "weather": "Bamenda has a highland tropical climate: roughly a rainy season March–October and a drier season November–February. The dry season is generally easier for sightseeing and hiking; waterfalls tend to run fuller during the rains.",
}

CATEGORY_KEYWORDS = {
    "food": ("food", "eat", "restaurant", "cafe", "café", "dining", "hungry", "meal", "drink"),
    "culture": ("culture", "museum", "palace", "heritage", "history", "market", "traditional"),
    "adventure": ("hike", "hiking", "adventure", "trail", "trek", "climb", "viewpoint", "lookout"),
    "relaxation": ("relax", "chill", "lounge", "spa", "garden", "picnic"),
    "nature": ("waterfall", "nature", "lake", "forest", "outdoors"),
    "administrative": ("police", "immigration", "embassy", "government", "office", "hospital", "fire service"),
}

def matched_category(question):
    q = question.lower()
    for category, words in CATEGORY_KEYWORDS.items():
        if any(word in q for word in words): return category
    return None

def matched_faq(question):
    q = question.lower()
    for topic, words in FAQ_KEYWORDS.items():
        if any(word in q for word in words): return topic
    return None

def fetch_destinations(params):
    try:
        response = requests.get(f"{DESTINATION_SERVICE_URL}/destinations", params=params, timeout=5)
        response.raise_for_status()
        return response.json()
    except requests.RequestException:
        return None

@app.get("/health")
def health(): return jsonify({"status": "ok", "service": "assistant"})

@app.post("/ask")
def ask():
    body = request.get_json(silent=True) or {}
    question = str(body.get("question", "")).strip()
    if not question:
        return jsonify({"error": "Ask me something about visiting Bamenda."}), 400

    category = matched_category(question)
    places = fetch_destinations({"category": category}) if category else fetch_destinations({"search": question})
    faq_topic = matched_faq(question)

    if places:
        top = places[:3]
        listing = "; ".join(f"{p['name']} ({p.get('location', 'Bamenda')})" for p in top)
        answer = f"Here are a few places that might fit: {listing}."
        if faq_topic: answer += " " + FAQ_ANSWERS[faq_topic]
        return jsonify({"answer": answer, "suggestedDestinations": top})

    if faq_topic:
        return jsonify({"answer": FAQ_ANSWERS[faq_topic], "suggestedDestinations": []})

    return jsonify({
        "answer": "I'm a simple Bamenda travel assistant — I can help you find places to eat, stay, or visit "
                   "(try asking about waterfalls, museums, markets, or restaurants), or answer general questions "
                   "about currency, safety, getting around, or the best time to visit. What would you like to know?",
        "suggestedDestinations": []
    })

if __name__ == "__main__": app.run(port=5005, debug=False)
