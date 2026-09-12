function getToken() { return localStorage.getItem('gt_token'); }

async function apiFetch(path, options = {}) {
  const headers = options.headers || {};
  headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const signedOutView = document.getElementById('community-signed-out');
const appView = document.getElementById('community-app');
const conversationsList = document.getElementById('conversations-list');
const peopleList = document.getElementById('people-list');
const threadView = document.getElementById('thread-view');
const threadTitle = document.getElementById('thread-title');
const threadGroupActions = document.getElementById('thread-group-actions');
const messagesList = document.getElementById('messages-list');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const newGroupModal = document.getElementById('new-group-modal');
const newGroupForm = document.getElementById('new-group-form');
const newGroupMembers = document.getElementById('new-group-members');
const profileForm = document.getElementById('profile-form');
const profileStatus = document.getElementById('profile-status');

let currentUser = null;
let people = [];
let activeConversationId = null;
let pollTimer = null;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function nameFor(userId) {
  if (userId === currentUser.id) return 'You';
  const person = people.find((p) => p.id === userId);
  return person ? person.name : 'Traveler';
}

function conversationLabel(conv) {
  if (conv.type === 'group') return conv.name || 'Group';
  const otherId = conv.memberIds.find((id) => id !== currentUser.id);
  return nameFor(otherId);
}

async function loadPeople() {
  people = await apiFetch('/api/users');
  peopleList.innerHTML = '';
  if (!people.length) {
    peopleList.innerHTML = '<span class="helper-text">No other travelers have joined yet.</span>';
    return;
  }
  people.forEach((person) => {
    const el = document.createElement('div');
    el.className = 'item person-item';
    const profile = person.profile || {};
    el.innerHTML = `
      ${profile.photo ? `<img class="person-photo" src="${escapeHtml(profile.photo)}" alt="${escapeHtml(person.name)}" />` : '<div class="person-photo person-photo-placeholder">👤</div>'}
      <div>
        <h3>${escapeHtml(person.name)}</h3>
        <small>${escapeHtml([profile.occupation, [profile.area, profile.city].filter(Boolean).join(', ')].filter(Boolean).join(' · ')) || 'No profile details yet'}</small>
      </div>
      <button type="button" data-action="message">Message</button>
    `;
    el.querySelector('[data-action="message"]').addEventListener('click', () => startDirectConversation(person.id));
    peopleList.appendChild(el);
  });
}

async function startDirectConversation(otherUserId) {
  const conv = await apiFetch('/api/conversations', { method: 'POST', body: JSON.stringify({ type: 'direct', memberIds: [otherUserId] }) });
  switchTab('chats');
  await loadConversations();
  openThread(conv.id);
}

async function loadConversations() {
  const conversations = await apiFetch('/api/conversations');
  conversationsList.innerHTML = '';
  if (!conversations.length) {
    conversationsList.innerHTML = '<span class="helper-text">No conversations yet — message someone from the People tab.</span>';
    return;
  }
  conversations.forEach((conv) => {
    const el = document.createElement('div');
    el.className = 'item conversation-item';
    const preview = conv.lastMessage ? escapeHtml(conv.lastMessage.text).slice(0, 80) : 'No messages yet';
    el.innerHTML = `<h3>${escapeHtml(conversationLabel(conv))}${conv.type === 'group' ? ' 👥' : ''}</h3><small>${preview}</small>`;
    el.addEventListener('click', () => openThread(conv.id, conv));
    conversationsList.appendChild(el);
  });
}

async function openThread(conversationId, convHint) {
  activeConversationId = conversationId;
  threadView.classList.remove('hidden');
  const conversations = convHint ? [convHint] : await apiFetch('/api/conversations');
  const conv = conversations.find((c) => c.id === conversationId) || convHint;
  threadTitle.textContent = conversationLabel(conv);
  threadGroupActions.classList.toggle('hidden', conv.type !== 'group');
  threadGroupActions.dataset.conversationId = conversationId;
  threadGroupActions.dataset.itineraryId = conv.itineraryId || '';
  await loadMessages();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(loadMessages, 4000);
}

async function loadMessages() {
  if (!activeConversationId) return;
  const thread = await apiFetch(`/api/conversations/${activeConversationId}/messages`);
  messagesList.innerHTML = thread.map((m) => `
    <div class="message-bubble ${m.senderId === currentUser.id ? 'message-mine' : ''}">
      <strong>${escapeHtml(m.senderName)}</strong>
      <p>${escapeHtml(m.text)}</p>
    </div>
  `).join('');
  messagesList.scrollTop = messagesList.scrollHeight;
}

messageForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !activeConversationId) return;
  messageInput.value = '';
  try {
    await apiFetch(`/api/conversations/${activeConversationId}/messages`, { method: 'POST', body: JSON.stringify({ text }) });
    await loadMessages();
  } catch (error) {
    profileStatus.textContent = error.message;
  }
});

document.getElementById('add-member-button').addEventListener('click', async () => {
  const target = people.find((p) => p.name.toLowerCase() === (prompt('Add who? Type their exact name:') || '').trim().toLowerCase());
  if (!target) return;
  try {
    await apiFetch(`/api/conversations/${activeConversationId}/members`, { method: 'POST', body: JSON.stringify({ userId: target.id }) });
    await loadConversations();
  } catch (error) {
    alert(error.message);
  }
});

document.getElementById('leave-group-button').addEventListener('click', async () => {
  if (!confirm('Leave this group?')) return;
  await apiFetch(`/api/conversations/${activeConversationId}/members/${currentUser.id}`, { method: 'DELETE' });
  threadView.classList.add('hidden');
  activeConversationId = null;
  await loadConversations();
});

document.getElementById('plan-trip-button').addEventListener('click', async () => {
  const title = prompt('Name this group trip:');
  if (!title) return;
  const conv = (await apiFetch('/api/conversations')).find((c) => c.id === activeConversationId);
  const collaboratorIds = conv.memberIds.filter((id) => id !== currentUser.id);
  const itinerary = await apiFetch('/api/itineraries', { method: 'POST', body: JSON.stringify({ title, collaboratorIds }) });
  await apiFetch(`/api/conversations/${activeConversationId}/itinerary`, { method: 'POST', body: JSON.stringify({ itineraryId: itinerary.id }) });
  window.location.href = '/itinerary';
});

document.getElementById('new-group-button').addEventListener('click', () => {
  newGroupMembers.innerHTML = '';
  people.forEach((person) => {
    const label = document.createElement('label');
    label.className = 'consent-control';
    label.innerHTML = `<input type="checkbox" value="${person.id}" /> ${escapeHtml(person.name)}`;
    newGroupMembers.appendChild(label);
  });
  newGroupModal.classList.remove('hidden');
});

document.getElementById('new-group-close').addEventListener('click', () => newGroupModal.classList.add('hidden'));

newGroupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = document.getElementById('new-group-name').value.trim();
  const memberIds = Array.from(newGroupMembers.querySelectorAll('input:checked')).map((el) => el.value);
  if (!name || !memberIds.length) return;
  try {
    const conv = await apiFetch('/api/conversations', { method: 'POST', body: JSON.stringify({ type: 'group', name, memberIds }) });
    newGroupModal.classList.add('hidden');
    newGroupForm.reset();
    await loadConversations();
    openThread(conv.id, conv);
  } catch (error) {
    alert(error.message);
  }
});

profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  profileStatus.textContent = 'Saving…';
  try {
    currentUser = await apiFetch('/api/me/profile', {
      method: 'POST',
      body: JSON.stringify({
        photo: document.getElementById('profile-photo').value,
        phone: document.getElementById('profile-phone').value,
        city: document.getElementById('profile-city').value,
        area: document.getElementById('profile-area').value,
        occupation: document.getElementById('profile-occupation').value
      })
    });
    profileStatus.textContent = 'Saved.';
  } catch (error) {
    profileStatus.textContent = error.message;
  }
});

function switchTab(tab) {
  document.querySelectorAll('.community-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
  document.querySelectorAll('.community-panel').forEach((panel) => panel.classList.toggle('hidden', panel.id !== `tab-${tab}`));
}

document.querySelectorAll('.community-tab').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

async function init() {
  if (!getToken()) {
    signedOutView.classList.remove('hidden');
    return;
  }
  try {
    const data = await apiFetch('/api/me');
    currentUser = data;
  } catch {
    signedOutView.classList.remove('hidden');
    return;
  }
  appView.classList.remove('hidden');
  const profile = currentUser.profile || {};
  document.getElementById('profile-photo').value = profile.photo || '';
  document.getElementById('profile-phone').value = profile.phone || '';
  document.getElementById('profile-city').value = profile.city || '';
  document.getElementById('profile-area').value = profile.area || '';
  document.getElementById('profile-occupation').value = profile.occupation || '';
  await loadPeople();
  await loadConversations();
}

init();
