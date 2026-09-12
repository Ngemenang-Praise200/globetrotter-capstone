const statusText = document.getElementById('admin-status');
const token = localStorage.getItem('gt_token');
const map = L.map('map').setView([5.9631, 10.1591], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
async function loadLocations() {
  const response = await fetch('/api/admin/locations', { headers: { Authorization: `Bearer ${token}` } });
  const users = await response.json();
  if (!response.ok) throw new Error(users.error || 'Unable to load locations.');
  if (!users.length) { statusText.textContent = 'No users are currently sharing their location.'; return; }
  const points = users.map((user) => { const marker = L.marker([user.location.lat, user.location.lon]).addTo(map).bindPopup(`<strong>${user.name}</strong><br>Area: ${user.location.area || 'Current location'}<br>Shared: ${new Date(user.location.updatedAt).toLocaleString()}`); return marker.getLatLng(); });
  map.fitBounds(L.latLngBounds(points), { padding: [36, 36] }); statusText.textContent = `${users.length} consenting user${users.length === 1 ? '' : 's'} shown.`;
}
loadLocations().catch(error => statusText.textContent = error.message);
