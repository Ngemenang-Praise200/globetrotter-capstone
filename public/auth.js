const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const showRegisterButton = document.getElementById('show-register-button');
const showLoginButton = document.getElementById('show-login-button');
const loginFeedback = document.getElementById('login-feedback');
const registerFeedback = document.getElementById('register-feedback');

function saveToken(token) {
  localStorage.setItem('gt_token', token);
}

async function apiFetch(path, options = {}) {
  const headers = options.headers || {};
  headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'API request failed');
  }
  return data;
}

function showRegister() {
  loginForm.classList.add('hidden');
  showRegisterButton.parentElement.classList.add('hidden');
  registerForm.classList.remove('hidden');
}

function showLogin() {
  registerForm.classList.add('hidden');
  showRegisterButton.parentElement.classList.remove('hidden');
  loginForm.classList.remove('hidden');
}

showRegisterButton.addEventListener('click', showRegister);
showLoginButton.addEventListener('click', showLogin);

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginFeedback.textContent = '';
  const submitButton = loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = 'Logging in…';
  try {
    const data = await apiFetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('login-email').value,
        password: document.getElementById('login-password').value
      })
    });
    saveToken(data.token);
    // Full navigation to "/" so the home page loads fresh, sees the saved
    // token, and shows the dashboard — the same reliable path registration
    // already used, instead of trying to swap views in place on this page.
    window.location.assign('/');
  } catch (error) {
    loginFeedback.textContent = error.message || 'Could not log in. Please check your email and password.';
    submitButton.disabled = false;
    submitButton.textContent = 'Login as user';
  }
});

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = registerForm.querySelector('button[type="submit"]');
  registerFeedback.textContent = '';
  submitButton.disabled = true;
  submitButton.textContent = 'Creating account…';
  try {
    const selectedInterests = Array.from(document.getElementById('register-interests').selectedOptions).map((option) => option.value);
    const data = await apiFetch('/api/register', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('register-name').value,
        email: document.getElementById('register-email').value,
        password: document.getElementById('register-password').value,
        interests: selectedInterests,
        location: document.getElementById('register-location').value,
        shareLocation: document.getElementById('register-location-consent').checked
      })
    });
    saveToken(data.token);
    registerFeedback.classList.add('success');
    registerFeedback.textContent = 'Account created. Opening your home page…';
    window.location.assign('/');
  } catch (error) {
    registerFeedback.classList.remove('success');
    registerFeedback.textContent = error.message || 'We could not create your account. Please try again.';
    submitButton.disabled = false;
    submitButton.textContent = 'Create account';
  }
});

// Deep-link support: /auth.html?mode=register opens straight to the register form.
if (new URLSearchParams(window.location.search).get('mode') === 'register') {
  showRegister();
}
