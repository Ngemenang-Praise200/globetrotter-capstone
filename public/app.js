const landingPanel = document.getElementById('landing-panel');
const drawerServicesContainer = document.getElementById('drawer-services');
const menuToggle = document.getElementById('menu-toggle');
const navDrawer = document.getElementById('nav-drawer');
const navDrawerClose = document.getElementById('nav-drawer-close');
const navDrawerBackdrop = document.getElementById('nav-drawer-backdrop');
const landingShareButton = document.getElementById('landing-share-button');
const dashboard = document.getElementById('dashboard');
const welcomeText = document.getElementById('welcome-text');
const userInterests = document.getElementById('user-interests');
const logoutButton = document.getElementById('logout-button');
const adminLink = document.getElementById('admin-link');
const messages = document.getElementById('messages');
const servicesContainer = document.getElementById('services');
const itinerariesContainer = document.getElementById('itineraries');
const favoritesContainer = document.getElementById('favorites-list');
const newItineraryButton = document.getElementById('new-itinerary-button');
const itineraryFormPanel = document.getElementById('itinerary-form-panel');
const itineraryForm = document.getElementById('itinerary-form');
const itineraryTitle = document.getElementById('itinerary-title');
const itineraryDestinationIds = document.getElementById('itinerary-destination-ids');
const itinerarySelection = document.getElementById('itinerary-selection');
const itineraryStart = document.getElementById('itinerary-start');
const itineraryEnd = document.getElementById('itinerary-end');
const itineraryNotes = document.getElementById('itinerary-notes');
const shareItineraryButton = document.getElementById('share-itinerary-button');
const cancelItinerary = document.getElementById('cancel-itinerary');
const placeLookupForm = document.getElementById('place-lookup-form');
const placeLookupQuery = document.getElementById('place-lookup-query');
const placeLookupStatus = document.getElementById('place-lookup-status');
const locateMeButton = document.getElementById('locate-me-button');
const locateStatus = document.getElementById('locate-status');
const stopLiveDirectionsButton = document.getElementById('stop-live-directions-button');
const shareLocationConsent = document.getElementById('share-location-consent');
const placeModal = document.getElementById('place-modal');
const placeModalBody = document.getElementById('place-modal-body');
const placeModalClose = document.getElementById('place-modal-close');

// Keep the place search immediately above the map instead of in a separate card.
const placeSearchCard = placeLookupForm.closest('.card');
const mainMapCard = document.querySelector('.map-card');
if (placeSearchCard && mainMapCard) {
  const mapHeading = mainMapCard.querySelector('.section-heading');
  placeLookupForm.classList.add('map-search-form');
  placeLookupForm.querySelector('button').textContent = 'Search map';
  placeLookupQuery.placeholder = 'Search an area or place, e.g. Small Soppo Market';
  placeLookupStatus.classList.add('map-search-status');
  mapHeading.after(placeLookupForm, placeLookupStatus, document.getElementById('place-lookup-result'));
  placeSearchCard.remove();
}

let activeItineraryId = null;
let currentUser = null;
let selectedDestinationIds = [];
let bamendaMap = null;
let mapMarkers = [];
let userMarker = null;
let userLocation = null;
let activeMapFilter = '';
let routeLine = null;
let locationWatchId = null;
let lastRouteOrigin = null;
let lastRouteUpdatedAt = 0;

async function showDirectionsOnMap(destination) {
  if (!navigator.geolocation) { showMessage('Your browser does not support location for directions.'); return; }
  placeModal.classList.add('hidden');
  showMessage('Finding your location and drawing the route…');
  navigator.geolocation.getCurrentPosition(async (position) => {
    userLocation = { lat: position.coords.latitude, lon: position.coords.longitude };
    initMap();
    plotUserMarker();
    try {
      const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${userLocation.lon},${userLocation.lat};${destination.lon},${destination.lat}?overview=full&geometries=geojson`);
      const data = await response.json();
      if (!response.ok || !data.routes?.[0]) throw new Error('No driving route was available.');
      if (routeLine) routeLine.remove();
      routeLine = window.L.geoJSON(data.routes[0].geometry, { style: { color: '#cf643a', weight: 6, opacity: 0.9 } }).addTo(bamendaMap);
      bamendaMap.fitBounds(routeLine.getBounds(), { padding: [32, 32] });
      showMessage(`Route ready — approximately ${(data.routes[0].distance / 1000).toFixed(1)} km.`);
    } catch (error) { showMessage(error.message || 'Directions are unavailable right now.'); }
  }, () => showMessage('Allow location access to get directions from your position.'), { enableHighAccuracy: true, timeout: 10000 });
}

async function drawLiveRoute(destination) {
  if (!userLocation) return;
  try {
    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${userLocation.lon},${userLocation.lat};${destination.lon},${destination.lat}?overview=full&geometries=geojson`);
    const data = await response.json();
    if (!response.ok || !data.routes?.[0]) throw new Error('No driving route was available.');
    if (routeLine) routeLine.remove();
    routeLine = window.L.geoJSON(data.routes[0].geometry, { style: { color: '#cf643a', weight: 6, opacity: 0.9 } }).addTo(bamendaMap);
    bamendaMap.fitBounds(routeLine.getBounds(), { padding: [32, 32] });
    locateStatus.textContent = `Live directions active — about ${(data.routes[0].distance / 1000).toFixed(1)} km remaining.`;
  } catch (error) { showMessage(error.message || 'Directions are unavailable right now.'); }
}

function stopLiveDirections() {
  if (locationWatchId !== null) navigator.geolocation.clearWatch(locationWatchId);
  locationWatchId = null;
  lastRouteOrigin = null;
  stopLiveDirectionsButton.classList.add('hidden');
  locateStatus.textContent = 'Live directions stopped.';
}

function startLiveDirections(destination) {
  if (!navigator.geolocation) { showMessage('Your browser does not support location for directions.'); return; }
  placeModal.classList.add('hidden');
  if (locationWatchId !== null) stopLiveDirections();
  showMessage('Starting live directions in the map…');
  locationWatchId = navigator.geolocation.watchPosition((position) => {
    userLocation = { lat: position.coords.latitude, lon: position.coords.longitude };
    initMap();
    plotUserMarker();
    const movedKm = lastRouteOrigin ? Math.hypot(userLocation.lat - lastRouteOrigin.lat, userLocation.lon - lastRouteOrigin.lon) * 111 : Infinity;
    if (movedKm > 0.03 || Date.now() - lastRouteUpdatedAt > 15000) {
      lastRouteOrigin = { ...userLocation };
      lastRouteUpdatedAt = Date.now();
      drawLiveRoute(destination);
    }
    stopLiveDirectionsButton.classList.remove('hidden');
  }, () => {
    stopLiveDirections();
    showMessage('Allow location access to start live directions.');
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 });
}

function openLiveNavigation(destination) {
  if (!Number.isFinite(destination.lat) || !Number.isFinite(destination.lon)) {
    showMessage('This destination does not have map coordinates yet.');
    return;
  }
  if (!navigator.geolocation) {
    showMessage('Your browser does not support live navigation.');
    return;
  }
  showMessage('Getting your current location for live navigation…');
  navigator.geolocation.getCurrentPosition((position) => {
    const origin = `${position.coords.latitude},${position.coords.longitude}`;
    const destinationPoint = `${destination.lat},${destination.lon}`;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destinationPoint)}&travelmode=driving`;
    window.location.assign(url);
  }, () => showMessage('Allow location access to open live navigation from your position.'), {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 30000
  });
}

function getToken() {
  return localStorage.getItem('gt_token');
}

function saveToken(token) {
  localStorage.setItem('gt_token', token);
}

function clearAuth() {
  localStorage.removeItem('gt_token');
  currentUser = null;
  selectedDestinationIds = [];
}

function showSection() {
  if (getToken()) {
    document.body.classList.remove('login-page');
    document.body.classList.add('dashboard-page');
    landingPanel.classList.add('hidden');
    dashboard.classList.remove('hidden');
  } else {
    document.body.classList.add('login-page');
    document.body.classList.remove('dashboard-page');
    landingPanel.classList.remove('hidden');
    dashboard.classList.add('hidden');
    itineraryFormPanel.classList.add('hidden');
  }
}

function showMessage(text) {
  const el = document.createElement('div');
  el.className = 'notification';
  el.textContent = text;
  messages.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

function openPlaceModal(destination) {
  const isMapSearchResult = destination.source === 'catalogue' || destination.source === 'external';
  const sourceLabel = destination.source === 'external' ? 'OpenStreetMap' : 'GlobeTrotter catalogue';
  const costLine = destination.costEstimate ? `<p><strong>Estimated food cost:</strong> ${destination.costEstimate}</p>` : '';
  const transportLine = destination.transport ? `<p><strong>Getting there:</strong> ${destination.transport}</p>` : '';
  const distanceLine = Number.isFinite(destination.distanceKm)
    ? `<p><strong>Distance from you:</strong> ${destination.distanceKm} km</p>`
    : (Number.isFinite(destination.distanceFromBamendaKm) ? `<p><strong>Distance from central Bamenda:</strong> ${destination.distanceFromBamendaKm} km</p>` : '');
  const highlightsLine = destination.highlights && destination.highlights.length
    ? `<p><strong>Highlights:</strong> ${destination.highlights.join(', ')}</p>`
    : '';
  const externalNote = destination.source === 'external'
    ? '<p class="helper-text">This place was looked up on the fly and isn\'t part of our curated catalogue yet, so treat the details above as general guidance.</p>'
    : '';
  const photoCredit = destination.imageCredit
    ? (destination.imageSource
        ? `<p class="photo-credit">Photo: <a href="${destination.imageSource}" target="_blank" rel="noopener">${destination.imageCredit}</a></p>`
        : `<p class="photo-credit">Photo: ${destination.imageCredit}</p>`)
    : '';

  if (isMapSearchResult) {
    placeModalBody.innerHTML = `
      ${destination.image ? `<img class="modal-image" src="${destination.image}" alt="${destination.imageLabel || destination.name}" />` : ''}
      ${photoCredit}
      <h2>${destination.name}</h2>
      <p><strong>Information source:</strong> ${sourceLabel}</p>
      ${destination.imageLabel ? `<p class="helper-text">${destination.imageLabel}. An individual photo of this exact place may not be available yet.</p>` : ''}
      <p><strong>What this place offers:</strong> ${destination.description || 'General place information is not available yet.'}</p>
      ${highlightsLine}
      <p><strong>Transport and fare:</strong> ${destination.transport || 'Transport guidance is not available yet.'}</p>
      <div class="destination-actions">
        ${Number.isFinite(destination.lat) && Number.isFinite(destination.lon) ? '<button type="button" id="modal-directions-button" class="direction-button">Start live directions in map</button>' : ''}
        ${Number.isFinite(destination.lat) && Number.isFinite(destination.lon) ? '<button type="button" id="modal-navigation-button" class="direction-button">Open live navigation</button>' : ''}
      </div>
    `;
    document.getElementById('modal-directions-button')?.addEventListener('click', () => startLiveDirections(destination));
    document.getElementById('modal-navigation-button')?.addEventListener('click', () => openLiveNavigation(destination));
    placeModal.classList.remove('hidden');
    return;
  }

  const isFavorited = Boolean(currentUser?.favorites?.includes(destination.id));
  const ratingLine = destination.reviewCount
    ? `<p class="rating-line">★ ${destination.averageRating} · ${destination.reviewCount} review${destination.reviewCount === 1 ? '' : 's'}</p>`
    : '<p class="rating-line helper-text">No reviews yet — be the first to leave one.</p>';

  placeModalBody.innerHTML = `
    ${destination.image && !destination.image.includes('source.unsplash.com') ? `<img class="modal-image" src="${destination.image}" alt="${destination.imageLabel || destination.name}" />` : ''}
    ${photoCredit}
    ${destination.imageLabel ? `<p class="helper-text">${destination.imageLabel}.</p>` : ''}
    <h2>${destination.name}</h2>
    ${ratingLine}
    <p>${destination.description || 'No description available yet.'}</p>
    <p><strong>Address:</strong> ${destination.address || destination.location || 'Not available'}</p>
    ${distanceLine}
    ${costLine}
    ${transportLine}
    ${highlightsLine}
    ${externalNote}
    <div class="destination-actions">
      <button type="button" id="modal-add-button">${selectedDestinationIds.includes(destination.id) ? 'Remove from itinerary' : 'Add to itinerary'}</button>
      ${currentUser ? `<button type="button" id="modal-favorite-button">${isFavorited ? '★ Saved to favorites' : '☆ Save to favorites'}</button>` : ''}
      ${Number.isFinite(destination.lat) && Number.isFinite(destination.lon) ? '<button type="button" id="modal-directions-button" class="direction-button">Start live directions in map</button>' : ''}
      ${Number.isFinite(destination.lat) && Number.isFinite(destination.lon) ? '<button type="button" id="modal-navigation-button" class="direction-button">Open live navigation</button>' : ''}
    </div>
    <div class="reviews-section">
      <h3>Reviews</h3>
      <div id="reviews-list">Loading reviews…</div>
      ${currentUser ? `
        <form id="review-form" class="review-form">
          <label for="review-rating">Your rating</label>
          <select id="review-rating" required>
            <option value="">Select a rating</option>
            <option value="5">5 – Excellent</option>
            <option value="4">4 – Very good</option>
            <option value="3">3 – Good</option>
            <option value="2">2 – Fair</option>
            <option value="1">1 – Poor</option>
          </select>
          <textarea id="review-comment" placeholder="Share what you liked or didn't (optional)" maxlength="500"></textarea>
          <button type="submit">Post review</button>
        </form>
      ` : '<p class="helper-text">Sign in to leave a review.</p>'}
    </div>
  `;
  const modalAddButton = document.getElementById('modal-add-button');
  modalAddButton.addEventListener('click', () => {
    toggleDestinationSelection(destination);
    modalAddButton.textContent = selectedDestinationIds.includes(destination.id) ? 'Remove from itinerary' : 'Add to itinerary';
  });
  document.getElementById('modal-directions-button')?.addEventListener('click', () => startLiveDirections(destination));
  document.getElementById('modal-navigation-button')?.addEventListener('click', () => openLiveNavigation(destination));

  const favoriteButton = document.getElementById('modal-favorite-button');
  favoriteButton?.addEventListener('click', async () => {
    const nowFavorited = currentUser.favorites?.includes(destination.id);
    try {
      if (nowFavorited) {
        await apiFetch(`/api/me/favorites/${destination.id}`, { method: 'DELETE' });
        currentUser.favorites = currentUser.favorites.filter((id) => id !== destination.id);
        showMessage(`${destination.name} removed from favorites.`);
      } else {
        await apiFetch('/api/me/favorites', { method: 'POST', body: JSON.stringify({ destinationId: destination.id }) });
        currentUser.favorites = [...(currentUser.favorites || []), destination.id];
        showMessage(`${destination.name} saved to favorites.`);
      }
      favoriteButton.textContent = currentUser.favorites.includes(destination.id) ? '★ Saved to favorites' : '☆ Save to favorites';
    } catch (error) {
      showMessage(error.message);
    }
  });

  loadReviews(destination.id);
  const reviewForm = document.getElementById('review-form');
  reviewForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const rating = document.getElementById('review-rating').value;
    const comment = document.getElementById('review-comment').value;
    if (!rating) { showMessage('Please select a rating.'); return; }
    try {
      await apiFetch(`/api/destinations/${destination.id}/reviews`, { method: 'POST', body: JSON.stringify({ rating: Number(rating), comment }) });
      showMessage('Review posted. Thank you!');
      reviewForm.reset();
      loadReviews(destination.id);
    } catch (error) {
      showMessage(error.message);
    }
  });

  placeModal.classList.remove('hidden');
}

placeModalClose.addEventListener('click', () => placeModal.classList.add('hidden'));
placeModal.addEventListener('click', (event) => {
  if (event.target === placeModal) placeModal.classList.add('hidden');
});

function renderPlaceLookupResult(destination) {
  placeLookupStatus.textContent = `Found "${destination.name}" — see the pin on the map below.`;
  if (window.L && bamendaMap && Number.isFinite(destination.lat) && Number.isFinite(destination.lon)) {
    const marker = window.L.marker([destination.lat, destination.lon]).addTo(bamendaMap).bindPopup(`<strong>${destination.name}</strong>`);
    mapMarkers.push(marker);
    bamendaMap.setView([destination.lat, destination.lon], 15);
  }
  openPlaceModal(destination);
}

placeLookupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = placeLookupQuery.value.trim();
  if (!query) return;
  placeLookupStatus.textContent = 'Searching…';
  try {
    const destination = await apiFetch(`/api/place-lookup?q=${encodeURIComponent(query)}`);
    renderPlaceLookupResult(destination);
  } catch (error) {
    placeLookupStatus.textContent = error.message;
  }
});

let userZoneCircle = null;

function plotUserMarker(label = 'You are here') {
  if (!window.L || !bamendaMap || !userLocation) return;
  if (userMarker) userMarker.remove();
  if (userZoneCircle) { userZoneCircle.remove(); userZoneCircle = null; }
  const youIcon = window.L.divIcon({
    className: 'you-marker',
    html: '<span></span>',
    iconSize: [18, 18]
  });
  userMarker = window.L.marker([userLocation.lat, userLocation.lon], { icon: youIcon })
    .addTo(bamendaMap)
    .bindPopup(`<strong>${label}</strong>`)
    .openPopup();
  bamendaMap.setView([userLocation.lat, userLocation.lon], 15);
}

// A registered "area" (e.g. "Mile 4") is a rough neighborhood pick, not a
// GPS fix — showing it as a sharp pin would overstate how precise it is.
// A shaded zone communicates "somewhere around here" honestly instead.
function plotAreaZone(label) {
  if (!window.L || !bamendaMap || !userLocation) return;
  if (userMarker) { userMarker.remove(); userMarker = null; }
  if (userZoneCircle) userZoneCircle.remove();
  userZoneCircle = window.L.circle([userLocation.lat, userLocation.lon], {
    radius: 600,
    color: '#ea7a2b',
    weight: 2,
    fillColor: '#ea7a2b',
    fillOpacity: 0.16
  })
    .addTo(bamendaMap)
    .bindPopup(`<strong>${label}</strong><br><small>Approximate area — allow location access in your browser for your exact position.</small>`)
    .openPopup();
  bamendaMap.setView([userLocation.lat, userLocation.lon], 14);
}

async function maybeShareLocationWithAdmins() {
  if (!shareLocationConsent.checked || !userLocation) return;
  try {
    await apiFetch('/api/me/location', {
      method: 'POST',
      body: JSON.stringify({ lat: userLocation.lat, lon: userLocation.lon })
    });
  } catch (error) {
    showMessage(error.message);
  }
}

shareLocationConsent.addEventListener('change', async () => {
  if (!shareLocationConsent.checked) {
    try {
      await apiFetch('/api/me/location', { method: 'DELETE' });
      showMessage('Location sharing turned off.');
    } catch (error) {
      showMessage(error.message);
    }
    return;
  }
  if (userLocation) {
    await maybeShareLocationWithAdmins();
    showMessage('Your location is now shared with admins.');
  }
});

stopLiveDirectionsButton.addEventListener('click', stopLiveDirections);

const updateAreaForm = document.getElementById('update-area-form');
const updateAreaInput = document.getElementById('update-area-input');
const updateAreaConsent = document.getElementById('update-area-consent');
const updateAreaStatus = document.getElementById('update-area-status');

updateAreaForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const area = updateAreaInput.value.trim();
  if (!area) {
    updateAreaStatus.textContent = 'Choose an area from the list.';
    return;
  }
  updateAreaStatus.textContent = 'Saving…';
  try {
    const updatedUser = await apiFetch('/api/me/area', {
      method: 'POST',
      body: JSON.stringify({ area, shareLocation: updateAreaConsent.checked })
    });
    currentUser = updatedUser;
    shareLocationConsent.checked = Boolean(currentUser.sharesLocation);
    updateAreaStatus.textContent = `Saved — using ${currentUser.area?.name || area} on your map.`;
    // Only move the pin to the newly saved area if we don't already have a
    // live GPS fix — live location should still win when it's available.
    if (!userLocation && currentUser.area?.lat != null) {
      userLocation = { lat: currentUser.area.lat, lon: currentUser.area.lon };
      plotAreaZone(`Your registered area — ${currentUser.area.name}`);
    }
  } catch (error) {
    updateAreaStatus.textContent = error.message;
  }
});

function locateUser({ silent = false } = {}) {
  if (!navigator.geolocation) {
    if (currentUser?.area?.lat != null && currentUser?.area?.lon != null) {
      userLocation = { lat: currentUser.area.lat, lon: currentUser.area.lon };
      plotAreaZone(`Your registered area — ${currentUser.area.name}`);
      locateStatus.textContent = `Showing your registered area (${currentUser.area.name}).`;
    } else if (!silent) {
      locateStatus.textContent = 'Geolocation is not supported on this device.';
    }
    return;
  }
  if (!silent) locateStatus.textContent = 'Locating you…';
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      userLocation = { lat: position.coords.latitude, lon: position.coords.longitude };
      locateStatus.textContent = 'Location found — showing places closest to you on the map.';
      plotUserMarker();
      await maybeShareLocationWithAdmins();
      try {
        const nearby = await apiFetch(`/api/nearby?lat=${userLocation.lat}&lon=${userLocation.lon}&limit=8`);
        renderMap(nearby);
        plotUserMarker();
      } catch (error) {
        if (!silent) showMessage(error.message);
      }
    },
    () => {
      // Live GPS was denied or unavailable — fall back to the area the user
      // picked at registration (if any), so the map still shows roughly
      // where they are instead of nothing at all.
      if (currentUser?.area?.lat != null && currentUser?.area?.lon != null) {
        userLocation = { lat: currentUser.area.lat, lon: currentUser.area.lon };
        plotAreaZone(`Your registered area — ${currentUser.area.name}`);
        locateStatus.textContent = `Showing your registered area (${currentUser.area.name}). Allow location access in your browser for your exact position.`;
      } else if (!silent) {
        locateStatus.textContent = 'Could not access your location. Check your browser\'s location permission.';
      }
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

locateMeButton.addEventListener('click', () => locateUser());

function buildItineraryShareText() {
  const title = (itineraryTitle.value || 'My travel itinerary').trim() || 'My travel itinerary';
  const locations = selectedDestinationIds.length ? selectedDestinationIds.join(', ') : 'No places selected yet';
  const dates = `${itineraryStart.value || '—'} to ${itineraryEnd.value || '—'}`;
  const notes = itineraryNotes.value.trim() || 'No notes added';
  return [
    `GlobeTrotter itinerary: ${title}`,
    `Places: ${locations}`,
    `Dates: ${dates}`,
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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

async function loadReviews(destinationId) {
  const listEl = document.getElementById('reviews-list');
  if (!listEl) return;
  try {
    const data = await apiFetch(`/api/destinations/${destinationId}/reviews`);
    if (!data.reviews.length) {
      listEl.innerHTML = '<p class="helper-text">No reviews yet — be the first to leave one.</p>';
      return;
    }
    listEl.innerHTML = data.reviews.map((review) => `
      <div class="review-item">
        <strong>${escapeHtml(review.userName)}</strong> — ${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}
        ${review.comment ? `<p>${escapeHtml(review.comment)}</p>` : ''}
      </div>
    `).join('');
  } catch (error) {
    listEl.innerHTML = '<p class="helper-text">Could not load reviews right now.</p>';
  }
}

async function apiFetch(path, options = {}) {
  const headers = options.headers || {};
  headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'API request failed');
  }
  return data;
}

function resetItineraryBuilder() {
  activeItineraryId = null;
  selectedDestinationIds = [];
  itineraryTitle.value = '';
  itineraryDestinationIds.value = '';
  itineraryStart.value = '';
  itineraryEnd.value = '';
  itineraryNotes.value = '';
  renderSelectionChips();
}

function renderSelectionChips() {
  itineraryDestinationIds.value = selectedDestinationIds.join(', ');
  if (!selectedDestinationIds.length) {
    itinerarySelection.innerHTML = '<span class="helper-text">No places selected yet.</span>';
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
    });
  });
}

function toggleDestinationSelection(destination) {
  if (selectedDestinationIds.includes(destination.id)) {
    selectedDestinationIds = selectedDestinationIds.filter((id) => id !== destination.id);
    showMessage(`${destination.name} removed from your itinerary.`);
  } else {
    selectedDestinationIds = [...selectedDestinationIds, destination.id];
    showMessage(`${destination.name} added to your itinerary.`);
  }
  renderSelectionChips();
}

function initMap() {
  if (!window.L || bamendaMap) return;
  bamendaMap = window.L.map('map').setView([5.9631, 10.1591], 13);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(bamendaMap);
}

function renderServices(services, container = servicesContainer) {
  container.innerHTML = '';
  if (!services.length) {
    container.innerHTML = '<span class="helper-text">No services are available right now.</span>';
    return;
  }

  services.forEach((service) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'service-card';
    card.innerHTML = `
      <span class="service-icon">${service.icon || '📍'}</span>
      <div class="service-card-content">
        <strong>${service.title}</strong>
        <p>${service.description}</p>
        <small>${service.count} place${service.count === 1 ? '' : 's'}</small>
      </div>
    `;
    card.addEventListener('click', () => {
      window.location.href = `/service.html?service=${encodeURIComponent(service.id)}`;
    });
    container.appendChild(card);
  });
}

async function loadServices(container = servicesContainer) {
  try {
    const services = await apiFetch('/api/services');
    renderServices(services, container);
  } catch (error) {
    if (container === servicesContainer) showMessage(error.message);
  }
}

function renderNavServices(services, container) {
  container.innerHTML = '';
  if (!services.length) {
    container.innerHTML = '<span class="helper-text">No services available.</span>';
    return;
  }
  services.forEach((service) => {
    const link = document.createElement('a');
    link.href = `/service.html?service=${encodeURIComponent(service.id)}`;
    link.className = 'nav-link';
    link.textContent = service.title;
    container.appendChild(link);
  });
}

async function loadNavServices(container) {
  if (!container) return;
  try {
    const services = await apiFetch('/api/services');
    renderNavServices(services, container);
  } catch (error) {
    container.innerHTML = '<span class="helper-text">Could not load services.</span>';
  }
}

function renderMap(destinations) {
  if (!window.L) return;
  initMap();
  mapMarkers.forEach((marker) => marker.remove());
  mapMarkers = [];

  const points = destinations.filter((destination) => Number.isFinite(destination.lat) && Number.isFinite(destination.lon));
  if (!points.length) return;

  points.forEach((destination) => {
    const popupId = `popup-details-${destination.id}`;
    const marker = window.L.marker([destination.lat, destination.lon])
      .addTo(bamendaMap)
      .bindPopup(`<strong>${destination.name}</strong><br>${destination.address || destination.location}<br><button type="button" class="popup-details-link" id="${popupId}">What's here?</button>`);
    marker.on('popupopen', () => {
      const link = document.getElementById(popupId);
      if (link) link.addEventListener('click', () => openPlaceModal(destination));
    });
    mapMarkers.push(marker);
  });

  const bounds = window.L.latLngBounds(points.map((destination) => [destination.lat, destination.lon]));
  bamendaMap.fitBounds(bounds, { padding: [24, 24] });
}

logoutButton.addEventListener('click', () => {
  clearAuth();
  showSection();
  showMessage('Logged out successfully.');
});

newItineraryButton.addEventListener('click', () => {
  window.location.href = '/itinerary.html';
});

shareItineraryButton.addEventListener('click', shareItinerary);

cancelItinerary.addEventListener('click', () => {
  resetItineraryBuilder();
  itineraryFormPanel.classList.add('hidden');
});

itineraryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    title: itineraryTitle.value,
    destinationIds: selectedDestinationIds,
    startDate: itineraryStart.value || null,
    endDate: itineraryEnd.value || null,
    notes: itineraryNotes.value
  };
  try {
    if (activeItineraryId) {
      await apiFetch(`/api/itineraries/${activeItineraryId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showMessage('Itinerary updated successfully.');
    } else {
      await apiFetch('/api/itineraries', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showMessage('New itinerary created.');
    }
    resetItineraryBuilder();
    itineraryFormPanel.classList.add('hidden');
    await loadItineraries();
  } catch (error) {
    showMessage(error.message);
  }
});

async function fetchCurrentUser() {
  try {
    const user = await apiFetch('/api/me');
    currentUser = user;
  } catch (error) {
    clearAuth();
    showSection();
  }
}

async function loadMapDestinations(category = '') {
  activeMapFilter = category;
  document.querySelectorAll('[data-map-filter]').forEach((button) => {
    button.classList.toggle('active', button.dataset.mapFilter === category);
  });
  try {
    const url = category ? `/api/destinations?category=${encodeURIComponent(category)}` : '/api/destinations';
    const destinations = await apiFetch(url);
    renderMap(destinations);
  } catch (error) {
    showMessage(error.message);
  }
}

function renderItineraryItem(itinerary) {
  const element = document.createElement('div');
  element.className = 'item';
  element.innerHTML = `
    <h3>${itinerary.title}</h3>
    <p>${itinerary.notes || 'No notes added.'}</p>
    <small>Destinations: ${itinerary.destinationIds.join(', ') || 'None'}</small>
    <small>Start: ${itinerary.startDate || '—'} • End: ${itinerary.endDate || '—'}</small>
    <div class="form-actions">
      <button type="button" data-action="edit" data-id="${itinerary.id}">Edit</button>
      <button type="button" data-action="delete" data-id="${itinerary.id}">Delete</button>
    </div>
  `;
  return element;
}

function renderFavoriteItem(destination) {
  const element = document.createElement('div');
  element.className = 'item';
  element.innerHTML = `
    <h3>${destination.name}</h3>
    <p>${destination.description || ''}</p>
    <small>${destination.location || destination.address || ''}</small>
    ${destination.reviewCount ? `<small>★ ${destination.averageRating} · ${destination.reviewCount} review${destination.reviewCount === 1 ? '' : 's'}</small>` : ''}
    <div class="form-actions">
      <button type="button" data-action="view">View</button>
      <button type="button" data-action="unfavorite">Remove</button>
    </div>
  `;
  element.querySelector('[data-action="view"]').addEventListener('click', () => openPlaceModal(destination));
  element.querySelector('[data-action="unfavorite"]').addEventListener('click', async () => {
    try {
      await apiFetch(`/api/me/favorites/${destination.id}`, { method: 'DELETE' });
      currentUser.favorites = (currentUser.favorites || []).filter((id) => id !== destination.id);
      showMessage(`${destination.name} removed from favorites.`);
      loadFavorites();
    } catch (error) {
      showMessage(error.message);
    }
  });
  return element;
}

async function loadFavorites() {
  if (!favoritesContainer) return;
  const favoriteIds = currentUser?.favorites || [];
  if (!favoriteIds.length) {
    favoritesContainer.innerHTML = '<span class="helper-text">No favorites saved yet — tap the star on any place to save it here.</span>';
    return;
  }
  try {
    const allDestinations = await apiFetch('/api/destinations');
    const favorites = allDestinations.filter((destination) => favoriteIds.includes(destination.id));
    favoritesContainer.innerHTML = '';
    if (!favorites.length) {
      favoritesContainer.innerHTML = '<span class="helper-text">No favorites saved yet — tap the star on any place to save it here.</span>';
      return;
    }
    favorites.forEach((destination) => favoritesContainer.appendChild(renderFavoriteItem(destination)));
  } catch (error) {
    favoritesContainer.innerHTML = '<span class="helper-text">Could not load your favorites right now.</span>';
  }
}

async function loadItineraries() {
  try {
    const itineraries = await apiFetch('/api/itineraries');
    itinerariesContainer.innerHTML = '';
    if (!itineraries.length) {
      itinerariesContainer.textContent = 'No itineraries created yet.';
      return;
    }
    itineraries.forEach((item) => {
      const card = renderItineraryItem(item);
      const editButton = card.querySelector('[data-action="edit"]');
      const deleteButton = card.querySelector('[data-action="delete"]');

      editButton.addEventListener('click', () => {
        activeItineraryId = item.id;
        selectedDestinationIds = [...item.destinationIds];
        itineraryTitle.value = item.title;
        itineraryDestinationIds.value = item.destinationIds.join(', ');
        itineraryStart.value = item.startDate || '';
        itineraryEnd.value = item.endDate || '';
        itineraryNotes.value = item.notes || '';
        renderSelectionChips();
        itineraryFormPanel.classList.remove('hidden');
      });

      deleteButton.addEventListener('click', async () => {
        if (!confirm('Delete this itinerary?')) {
          return;
        }
        try {
          await apiFetch(`/api/itineraries/${item.id}`, { method: 'DELETE' });
          showMessage('Itinerary deleted.');
          await loadItineraries();
        } catch (error) {
          showMessage(error.message);
        }
      });

      itinerariesContainer.appendChild(card);
    });
  } catch (error) {
    showMessage(error.message);
  }
}

async function initializeDashboard() {
  await fetchCurrentUser();
  if (!currentUser) return;

  welcomeText.textContent = `Welcome, ${currentUser.name}`;
  userInterests.textContent = currentUser.interests && currentUser.interests.length ? `Interests: ${currentUser.interests.join(', ')}` : 'Select your interests during registration.';
  adminLink.classList.toggle('hidden', !currentUser.isAdmin);
  shareLocationConsent.checked = Boolean(currentUser.sharesLocation);
  if (currentUser.area?.name && updateAreaInput) {
    updateAreaInput.value = currentUser.area.name;
    updateAreaConsent.checked = Boolean(currentUser.sharesLocation);
  }
  showSection();
  renderSelectionChips();
  await loadServices();
  initMap();
  locateUser({ silent: true });
  await loadItineraries();
  await loadFavorites();
}

document.querySelectorAll('[data-map-filter]').forEach((button) => {
  button.addEventListener('click', () => loadMapDestinations(button.dataset.mapFilter));
});

async function checkAuthOnLoad() {
  if (getToken()) {
    await initializeDashboard();
  } else {
    showSection();
  }
}

function initAssistantWidget() {
  const toggle = document.createElement('button');
  toggle.id = 'assistant-toggle';
  toggle.type = 'button';
  toggle.textContent = '💬 Ask about Bamenda';

  const panel = document.createElement('div');
  panel.id = 'assistant-panel';
  panel.className = 'hidden';
  panel.innerHTML = `
    <div class="assistant-header">
      <strong>Bamenda travel assistant</strong>
      <button type="button" id="assistant-close">×</button>
    </div>
    <div id="assistant-messages" class="assistant-messages">
      <div class="assistant-message assistant-message-bot">
        Hi! Ask me things like "waterfalls near Bamenda", "where can I eat", or "what currency do I need".
      </div>
    </div>
    <form id="assistant-form" class="assistant-form">
      <input type="text" id="assistant-input" placeholder="Ask a question…" autocomplete="off" />
      <button type="submit">Send</button>
    </form>
  `;

  document.body.appendChild(toggle);
  document.body.appendChild(panel);

  const messagesEl = panel.querySelector('#assistant-messages');
  const formEl = panel.querySelector('#assistant-form');
  const inputEl = panel.querySelector('#assistant-input');

  toggle.addEventListener('click', () => panel.classList.toggle('hidden'));
  panel.querySelector('#assistant-close').addEventListener('click', () => panel.classList.add('hidden'));

  function addMessage(text, who) {
    const bubble = document.createElement('div');
    bubble.className = `assistant-message assistant-message-${who}`;
    bubble.textContent = text;
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addSuggestions(destinations) {
    if (!destinations || !destinations.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'assistant-suggestions';
    destinations.forEach((destination) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'assistant-suggestion-chip';
      chip.textContent = destination.name;
      chip.addEventListener('click', () => openPlaceModal(destination));
      wrap.appendChild(chip);
    });
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  formEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    const question = inputEl.value.trim();
    if (!question) return;
    addMessage(question, 'user');
    inputEl.value = '';
    try {
      const data = await apiFetch('/api/assistant/ask', { method: 'POST', body: JSON.stringify({ question }) });
      addMessage(data.answer, 'bot');
      addSuggestions(data.suggestedDestinations);
    } catch (error) {
      addMessage("Sorry, I couldn't reach the assistant just now.", 'bot');
    }
  });
}

function openNavDrawer() {
  navDrawer.classList.remove('hidden');
  navDrawerBackdrop.classList.remove('hidden');
}

function closeNavDrawer() {
  navDrawer.classList.add('hidden');
  navDrawerBackdrop.classList.add('hidden');
}

menuToggle?.addEventListener('click', openNavDrawer);
navDrawerClose?.addEventListener('click', closeNavDrawer);
navDrawerBackdrop?.addEventListener('click', closeNavDrawer);

landingShareButton?.addEventListener('click', async () => {
  const shareData = {
    title: 'GlobeTrotter Bamenda',
    text: 'Discover places to eat, stay, and visit in Bamenda, Cameroon.',
    url: window.location.origin
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
  } catch (error) {
    if (error && error.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(shareData.url);
    showMessage('Link copied to clipboard.');
  } catch (error) {
    showMessage('Sharing is not available on this browser.');
  }
});

renderSelectionChips();
checkAuthOnLoad();
initAssistantWidget();
loadNavServices(drawerServicesContainer);