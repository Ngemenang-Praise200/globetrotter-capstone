const itineraryForm = document.getElementById('itinerary-form');
const itineraryTitle = document.getElementById('itinerary-title');
const itineraryDestinationIds = document.getElementById('itinerary-destination-ids');
const itinerarySelection = document.getElementById('itinerary-selection');
const itineraryStart = document.getElementById('itinerary-start');
const itineraryEnd = document.getElementById('itinerary-end');
const itineraryBudget = document.getElementById('itinerary-budget');
const itineraryNotes = document.getElementById('itinerary-notes');
const shareItineraryButton = document.getElementById('share-itinerary-button');
const destinationSearchForm = document.getElementById('destination-search-form');
const destinationSearch = document.getElementById('destination-search');
const destinationPicker = document.getElementById('destination-picker');
const messages = document.getElementById('messages');

let selectedDestinationIds = [];
let bamendaMap = null;
let mapMarkers = [];

function getToken() {
  return localStorage.getItem('gt_token');
}

function saveSelection() {
  localStorage.setItem('gt_selected_destination_ids', JSON.stringify(selectedDestinationIds));
}

function loadSelection() {
  try {
    const stored = JSON.parse(localStorage.getItem('gt_selected_destination_ids') || '[]');
    selectedDestinationIds = Array.isArray(stored) ? stored : [];
  } catch {
    selectedDestinationIds = [];
  }
}

function showMessage(text) {
  const el = document.createElement('div');
  el.className = 'notification';
  el.textContent = text;
  messages.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function buildItineraryShareText() {
  const title = (itineraryTitle.value || 'My travel itinerary').trim() || 'My travel itinerary';
  const locations = selectedDestinationIds.length ? selectedDestinationIds.join(', ') : 'No places selected yet';
  const dates = `${itineraryStart.value || '—'} to ${itineraryEnd.value || '—'}`;
  const budget = itineraryBudget.value ? `${itineraryBudget.value} XAF` : 'No budget set';
  const notes = itineraryNotes.value.trim() || 'No notes added';
  return [
    `GlobeTrotter itinerary: ${title}`,
    `Places: ${locations}`,
    `Dates: ${dates}`,
    `Budget: ${budget}`,
    `Notes: ${notes}`,
    `View it on GlobeTrotter: ${window.location.origin}`
  ].join('\n');
}

async function shareItinerary() {
  const shareText = buildItineraryShareText();

  try {
    if (navigator.share) {
      await navigator.share({
        title: 'GlobeTrotter itinerary',
        text: shareText,
        url: window.location.origin
      });
      showMessage('Itinerary shared.');
      return;
    }
  } catch (error) {
    if (error && error.name === 'AbortError') {
      return;
    }
  }

  try {
    await navigator.clipboard.writeText(shareText);
    showMessage('Itinerary details copied to clipboard.');
  } catch {
    showMessage('Sharing is not available on this browser.');
  }
}

async function apiFetch(path, options = {}) {
  const headers = options.headers || {};
  headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

function renderSelectionChips() {
  itineraryDestinationIds.value = selectedDestinationIds.join(', ');
  if (!selectedDestinationIds.length) {
    itinerarySelection.innerHTML = '<span class="helper-text">No places selected yet.</span>';
    saveSelection();
    return;
  }

  itinerarySelection.innerHTML = '';
  selectedDestinationIds.forEach((destinationId) => {
    const chip = document.createElement('div');
    chip.className = 'selection-chip';
    chip.innerHTML = `<span>${destinationId}</span><button type="button" data-remove-id="${destinationId}">×</button>`;
    itinerarySelection.appendChild(chip);
  });

  itinerarySelection.querySelectorAll('[data-remove-id]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedDestinationIds = selectedDestinationIds.filter((id) => id !== button.dataset.removeId);
      renderSelectionChips();
      renderMap();
    });
  });
  saveSelection();
}

function toggleDestinationSelection(destination) {
  if (selectedDestinationIds.includes(destination.id)) {
    selectedDestinationIds = selectedDestinationIds.filter((id) => id !== destination.id);
    showMessage(`${destination.name} removed.`);
  } else {
    selectedDestinationIds = [...selectedDestinationIds, destination.id];
    showMessage(`${destination.name} added.`);
  }
  renderSelectionChips();
  renderMap();
}

function initMap() {
  if (!window.L || bamendaMap) return;
  bamendaMap = window.L.map('map').setView([5.96, 10.16], 12);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(bamendaMap);
}

function renderMap() {
  if (!window.L) return;
  initMap();
  mapMarkers.forEach((marker) => marker.remove());
  mapMarkers = [];

  if (!selectedDestinationIds.length) {
    return;
  }

  const selectedDestinations = allDestinations.filter((destination) => selectedDestinationIds.includes(destination.id));
  if (!selectedDestinations.length) return;

  selectedDestinations.forEach((destination) => {
    const marker = window.L.marker([destination.lat, destination.lon]).addTo(bamendaMap).bindPopup(`<strong>${destination.name}</strong><br>${destination.address || destination.location}`);
    mapMarkers.push(marker);
  });

  const bounds = window.L.latLngBounds(selectedDestinations.map((destination) => [destination.lat, destination.lon]));
  bamendaMap.fitBounds(bounds, { padding: [24, 24] });
}

function renderDestinationCards(destinations) {
  destinationPicker.innerHTML = '';
  if (!destinations.length) {
    destinationPicker.innerHTML = '<span class="helper-text">No places matched your search.</span>';
    return;
  }

  destinations.forEach((destination) => {
    const card = document.createElement('div');
    card.className = 'item';
    const isSelected = selectedDestinationIds.includes(destination.id);
    card.innerHTML = `
      <h3>${destination.name}</h3>
      <p>${destination.description}</p>
      <small>Location: ${destination.location}</small>
      <small>Address: ${destination.address || destination.location}</small>
      <div class="destination-actions">
        <button type="button" data-action="pick">${isSelected ? 'Remove from itinerary' : 'Add to itinerary'}</button>
      </div>
    `;
    card.querySelector('[data-action="pick"]').addEventListener('click', () => toggleDestinationSelection(destination));
    destinationPicker.appendChild(card);
  });
}

async function loadDestinations(query = '') {
  try {
    const destinations = await apiFetch(`/api/destinations?search=${encodeURIComponent(query)}`);
    allDestinations = destinations;
    renderDestinationCards(destinations);
    renderMap();
  } catch (error) {
    showMessage(error.message);
  }
}

let allDestinations = [];

itineraryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    title: itineraryTitle.value,
    destinationIds: selectedDestinationIds,
    startDate: itineraryStart.value || null,
    endDate: itineraryEnd.value || null,
    budget: itineraryBudget.value ? parseFloat(itineraryBudget.value) : null,
    notes: itineraryNotes.value
  };

  try {
    await apiFetch('/api/itineraries', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showMessage('Itinerary saved.');
    localStorage.removeItem('gt_selected_destination_ids');
    selectedDestinationIds = [];
    renderSelectionChips();
    itineraryForm.reset();
    renderMap();
  } catch (error) {
    showMessage(error.message);
  }
});

shareItineraryButton.addEventListener('click', shareItinerary);

destinationSearchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await loadDestinations(destinationSearch.value.trim());
});

loadSelection();
renderSelectionChips();
loadDestinations('');