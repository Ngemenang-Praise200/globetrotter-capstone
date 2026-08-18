const serviceTitle = document.getElementById('service-title');
const serviceDescription = document.getElementById('service-description');
const serviceResults = document.getElementById('service-results');
const placeModal = document.getElementById('place-modal');
const placeModalBody = document.getElementById('place-modal-body');
const placeModalClose = document.getElementById('place-modal-close');

let bamendaMap = null;
let mapMarkers = [];
let allDestinations = [];
let routeLine = null;

function showDirectionsOnMap(destination) {
  if (!navigator.geolocation) return alert('Your browser does not support location for directions.');
  placeModal.classList.add('hidden');
  navigator.geolocation.getCurrentPosition(async (position) => {
    try {
      const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${position.coords.longitude},${position.coords.latitude};${destination.lon},${destination.lat}?overview=full&geometries=geojson`);
      const data = await response.json();
      if (!response.ok || !data.routes?.[0]) throw new Error('No driving route was available.');
      if (routeLine) routeLine.remove();
      routeLine = L.geoJSON(data.routes[0].geometry, { style: { color: '#cf643a', weight: 6, opacity: 0.9 } }).addTo(bamendaMap);
      L.marker([position.coords.latitude, position.coords.longitude]).addTo(bamendaMap).bindPopup('Your starting point');
      bamendaMap.fitBounds(routeLine.getBounds(), { padding: [32, 32] });
    } catch (error) { alert(error.message || 'Directions are unavailable right now.'); }
  }, () => alert('Allow location access to get directions from your position.'), { enableHighAccuracy: true, timeout: 10000 });
}

const CATEGORY_IMAGE_QUERY = {
  food: 'restaurant-food',
  culture: 'cultural-heritage-site',
  nature: 'waterfall-nature',
  adventure: 'hiking-trail',
  relaxation: 'garden-lounge',
  administrative: 'government-office'
};

function imageFor(destination) {
  if (destination.image && !destination.image.includes('source.unsplash.com')) return destination.image;
  const images = {
    food: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=800&q=80',
    culture: 'https://images.unsplash.com/photo-1523805009345-7448845a9e53?auto=format&fit=crop&w=800&q=80',
    nature: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?auto=format&fit=crop&w=800&q=80',
    adventure: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80',
    relaxation: 'https://images.unsplash.com/photo-1497250681960-ef046c08a56e?auto=format&fit=crop&w=800&q=80',
    administrative: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80'
  };
  return images[destination.category] || images.adventure;
}

function openPlaceModal(destination) {
  const highlightsLine = destination.highlights && destination.highlights.length
    ? `<p><strong>Highlights:</strong> ${destination.highlights.join(', ')}</p>`
    : '';
  const photoCredit = destination.imageCredit
    ? `<p class="photo-credit">Photo: <a href="${destination.imageSource}" target="_blank" rel="noopener">${destination.imageCredit}</a></p>`
    : '';
  placeModalBody.innerHTML = `
    <img class="modal-image" src="${imageFor(destination)}" alt="${destination.name}" />
    ${photoCredit}
    <h2>${destination.name}</h2>
    <p>${destination.description}</p>
    <p><strong>Address:</strong> ${destination.address || destination.location}</p>
    ${destination.costEstimate ? `<p><strong>Estimated plate cost:</strong> ${destination.costEstimate}</p>` : ''}
    ${destination.transport ? `<p><strong>Getting there:</strong> ${destination.transport}</p>` : ''}
    ${highlightsLine}
    <div class="destination-actions">
      <button type="button" data-action="itinerary">Create itinerary with this place</button>
      ${Number.isFinite(destination.lat) && Number.isFinite(destination.lon) ? '<button type="button" data-action="directions" class="direction-button">Show directions on map</button>' : ''}
    </div>
  `;
  placeModalBody.querySelector('[data-action="itinerary"]').addEventListener('click', () => {
    const stored = JSON.parse(localStorage.getItem('gt_selected_destination_ids') || '[]');
    const ids = Array.isArray(stored) ? stored : [];
    if (!ids.includes(destination.id)) ids.push(destination.id);
    localStorage.setItem('gt_selected_destination_ids', JSON.stringify(ids));
    window.location.href = '/itinerary.html';
  });
  placeModalBody.querySelector('[data-action="directions"]')?.addEventListener('click', () => showDirectionsOnMap(destination));
  placeModal.classList.remove('hidden');
}

placeModalClose.addEventListener('click', () => placeModal.classList.add('hidden'));
placeModal.addEventListener('click', (event) => {
  if (event.target === placeModal) placeModal.classList.add('hidden');
});

function getServiceMeta(serviceId) {
  const metadata = {
    food: { title: 'Food & Dining in Bamenda', description: 'Discover restaurants, cafés, and food spots with exact addresses in Bamenda.' },
    culture: { title: 'Culture & Heritage in Bamenda', description: 'Visit historic landmarks, markets, and cultural centres around Bamenda.' },
    adventure: { title: 'Adventure in Bamenda', description: 'Explore outdoor trails, viewpoints, and scenic adventures.' },
    relaxation: { title: 'Relaxation in Bamenda', description: 'Find calm lounges, parks, and restful places to unwind.' },
    nature: { title: 'Nature in Bamenda', description: 'See waterfalls, parks, and green outdoor places around Bamenda.' },
    administrative: { title: 'Administrative Services in Bamenda', description: 'Find police stations, government offices, and other public services.' }
  };
  return metadata[serviceId] || { title: 'Bamenda places', description: 'Explore places and sites in Bamenda.' };
}

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name) || 'food';
}

function initMap() {
  if (!window.L || bamendaMap) return;
  bamendaMap = window.L.map('map').setView([5.96, 10.16], 12);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(bamendaMap);
}

function renderMap(destinations) {
  if (!window.L) return;
  initMap();
  mapMarkers.forEach((marker) => marker.remove());
  mapMarkers = [];

  if (!destinations.length) return;
  destinations.forEach((destination) => {
    const marker = window.L.marker([destination.lat, destination.lon]).addTo(bamendaMap).bindPopup(`<strong>${destination.name}</strong><br>${destination.address || destination.location}`);
    mapMarkers.push(marker);
  });

  const bounds = window.L.latLngBounds(destinations.map((destination) => [destination.lat, destination.lon]));
  bamendaMap.fitBounds(bounds, { padding: [24, 24] });
}

function renderResults(destinations) {
  serviceResults.innerHTML = '';
  if (!destinations.length) {
    serviceResults.innerHTML = '<span class="helper-text">No places found for this service yet.</span>';
    return;
  }

  destinations.forEach((destination) => {
    const card = document.createElement('div');
    card.className = 'item';
    card.innerHTML = `
      <div class="item-title">
        <img src="${imageFor(destination)}" alt="${destination.name} preview" />
        <h3>${destination.name}</h3>
      </div>
      <p>${destination.description}</p>
      <small>Location: ${destination.location}</small>
      <small>Address: ${destination.address || destination.location}</small>
      ${destination.costEstimate ? `<small>Estimated plate cost: ${destination.costEstimate}</small>` : ''}
      <small>Transport: ${destination.transport || 'Ask locally for a shared taxi or moto-taxi.'}</small>
      <div class="destination-actions">
        <button type="button" data-action="details">What's here?</button>
        <button type="button" data-action="itinerary">Create itinerary with this place</button>
        <button type="button" data-action="directions" class="direction-button">Show directions on map</button>
      </div>
    `;
    card.querySelector('[data-action="details"]').addEventListener('click', () => openPlaceModal(destination));
    card.querySelector('[data-action="itinerary"]').addEventListener('click', () => {
      const stored = JSON.parse(localStorage.getItem('gt_selected_destination_ids') || '[]');
      const ids = Array.isArray(stored) ? stored : [];
      if (!ids.includes(destination.id)) {
        ids.push(destination.id);
      }
      localStorage.setItem('gt_selected_destination_ids', JSON.stringify(ids));
      window.location.href = '/itinerary.html';
    });
    card.querySelector('[data-action="directions"]')?.addEventListener('click', () => showDirectionsOnMap(destination));
    serviceResults.appendChild(card);
  });
}

async function loadService(serviceId) {
  const meta = getServiceMeta(serviceId);
  serviceTitle.textContent = meta.title;
  serviceDescription.textContent = meta.description;
  try {
    const response = await fetch(`/api/destinations?category=${encodeURIComponent(serviceId)}`);
    const data = await response.json();
    allDestinations = data;
    renderResults(data);
    renderMap(data);
  } catch (error) {
    serviceResults.innerHTML = '<span class="helper-text">Unable to load places right now.</span>';
  }
}

const serviceId = getQueryParam('service');
loadService(serviceId);
