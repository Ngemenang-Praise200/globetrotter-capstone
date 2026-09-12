"""Assistant Service — a lightweight Bamenda-and-environs travel concierge. Runs on :5005.

This is a rule-based assistant, not a call to an external AI provider: it
matches keywords in the traveler's question against the Destination Service
catalogue, a set of general Bamenda travel tips, and a set of facts about
Bamenda's surrounding towns and region — so it can answer questions that go
beyond the specific places added to the app. No API key or third-party AI
service is needed, so the whole app stays runnable offline/locally without
extra setup or cost.
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
    "administrative": ("police", "immigration", "embassy", "government", "office", "hospital", "fire service", "council"),
}

# General knowledge about Bamenda's surrounding towns and region — this is
# what lets the assistant answer questions beyond just the places someone
# has added to the app's own catalogue.
REGION_KEYWORDS = {
    "environs": ("environs", "around bamenda", "near bamenda", "day trip", "day trips", "nearby town", "surrounding", "outskirts", "ring road", "region"),
    "bafut": ("bafut",),
    "bali": ("bali",),
    "mbengwi": ("mbengwi",),
    "santa": ("santa",),
    "bambili": ("bambili", "bambui", "university of bamenda", "uba"),
    "ndop": ("ndop", "ndu", "nkambe"),
}

REGION_ANSWERS = {
    "environs": "Bamenda sits in the Northwest Region's highlands, surrounded by smaller towns worth a day trip: Bafut and its historic Fon's palace, Bali, Mbengwi (waterfalls and hiking), Santa, and the university town of Bambili/Bambui. Most are reachable by shared taxi in under an hour.",
    "bafut": "Bafut is about 20–30 minutes from Bamenda, known for the Bafut Fon's Palace — one of the best-preserved traditional palaces in the Grassfields, with a museum and historic architecture.",
    "bali": "Bali is a town roughly 20km from Bamenda along the Bamenda–Bafoussam road, known for its own Fondom (traditional chiefdom) and a weekly market.",
    "mbengwi": "Mbengwi is northwest of Bamenda, known for waterfalls in the surrounding hills — a popular nature and hiking day trip from the city.",
    "santa": "Santa is a town on the road between Bamenda and Bafoussam, a common stopover point when traveling further into Cameroon's Western Region.",
    "bambili": "Bambili and Bambui, northeast of central Bamenda, are home to the University of Bamenda's main campus and have a lively student-town atmosphere.",
    "ndop": "Further along the Ring Road from Bamenda are Ndop, Ndu, and Nkambe — worth the trip if you have more time, known for scenic highland landscapes and traditional Grassfields culture.",
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

def matched_region(question):
    q = question.lower()
    for topic, words in REGION_KEYWORDS.items():
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
        return jsonify({"error": "Ask me something about visiting Bamenda and its environs."}), 400

    category = matched_category(question)
    places = fetch_destinations({"category": category}) if category else fetch_destinations({"search": question})
    faq_topic = matched_faq(question)
    region_topic = matched_region(question)

    if places:
        top = places[:3]
        listing = "; ".join(f"{p['name']} ({p.get('location', 'Bamenda')})" for p in top)
        answer = f"Here are a few places that might fit: {listing}."
        if faq_topic: answer += " " + FAQ_ANSWERS[faq_topic]
        elif region_topic: answer += " " + REGION_ANSWERS[region_topic]
        return jsonify({"answer": answer, "suggestedDestinations": top})

    if faq_topic:
        return jsonify({"answer": FAQ_ANSWERS[faq_topic], "suggestedDestinations": []})

    if region_topic:
        return jsonify({"answer": REGION_ANSWERS[region_topic], "suggestedDestinations": []})

    return jsonify({
        "answer": "I'm a simple Bamenda-and-environs travel assistant — I can help you find places to eat, stay, or visit "
                   "(try asking about waterfalls, museums, markets, or restaurants), answer general questions about "
                   "currency, safety, getting around, or the best time to visit, or tell you about nearby towns like "
                   "Bafut, Bali, Mbengwi, or Bambili. What would you like to know?",
        "suggestedDestinations": []
    })

if __name__ == "__main__": app.run(port=5005, debug=False)
