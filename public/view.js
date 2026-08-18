const placeList = document.getElementById('place-list');

const places = [
  { name: 'Mile 4', description: 'A busy commercial and residential area known for its energy and businesses.', phone: '+237 673 456 789', lat: 5.965, lon: 10.155 },
  { name: 'Mile 3', description: 'A lively part of the city with restaurants, shops, and everyday activity.', phone: '+237 674 123 456', lat: 5.967, lon: 10.161 },
  { name: 'Mile 2', description: 'A well-known district that links residents and visitors to many city routes.', phone: '+237 675 234 567', lat: 5.972, lon: 10.166 },
  { name: 'Four Corners Bambili', description: 'A landmark junction associated with routes toward Bambili and surrounding communities.', phone: '+237 672 345 678', lat: 5.991, lon: 10.262 },
  { name: 'Foncha Junction', description: 'A major travel point that connects several parts of the city.', phone: '+237 676 543 210', lat: 5.968, lon: 10.151 },
  { name: 'New Road', description: 'A key route used for quick access through the city center.', phone: '+237 677 890 123', lat: 5.958, lon: 10.149 },
  { name: 'Nkwen Cultural Center', description: 'Located at Center Bolt Junction, this is a cultural landmark for local events and heritage.', phone: '+237 678 901 234', lat: 5.974, lon: 10.157 }
];

let bamendaMap = null;
let mapMarkers = [];

function initMap() {
  if (!window.L || bamendaMap) return;
  bamendaMap = window.L.map('map').setView([5.97, 10.16], 12);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(bamendaMap);
}

function renderPlaceList() {
  placeList.innerHTML = '';
  places.forEach((place) => {
    const card = document.createElement('article');
    card.className = 'place-card';
    card.innerHTML = `
      <h3>${place.name}</h3>
      <p>${place.description}</p>
      <p class="place-phone">Phone: <a href="tel:${place.phone}">${place.phone}</a></p>
    `;
    placeList.appendChild(card);
  });
}

function renderMap() {
  if (!window.L) return;
  initMap();
  mapMarkers.forEach((marker) => marker.remove());
  mapMarkers = [];

  places.forEach((place) => {
    const marker = window.L.marker([place.lat, place.lon]).addTo(bamendaMap).bindPopup(`<strong>${place.name}</strong><br>${place.description}<br><strong>Phone:</strong> ${place.phone}`);
    mapMarkers.push(marker);
  });

  const bounds = window.L.latLngBounds(places.map((place) => [place.lat, place.lon]));
  bamendaMap.fitBounds(bounds, { padding: [24, 24] });
}

renderPlaceList();
renderMap();