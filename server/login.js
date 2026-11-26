(function() {
  var loading = document.getElementById('loading');
  var loginForm = document.getElementById('login-form');
  var setupForm = document.getElementById('setup-form');

  function showError(id, msg) {
    var el = document.getElementById(id);
    el.textContent = msg;
    el.style.display = 'block';
  }
  function hideError(id) {
    document.getElementById(id).style.display = 'none';
  }

  // Check if already logged in
  fetch('/api/auth/me', { credentials: 'same-origin' })
    .then(function(r) { return r.json(); })
    .then(function(user) {
      if (user) {
        window.location.replace('/');
        return;
      }
      return init();
    })
    .catch(function() { init(); });

  function init() {
    fetch('/api/auth/setup-required')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        loading.classList.add('hidden');
        if (data.required) {
          if (data.tokenRequired) {
            document.getElementById('setup-token-row').classList.remove('hidden');
            document.getElementById('setup-token').required = true;
          }
          setupForm.classList.remove('hidden');
        } else {
          loginForm.classList.remove('hidden');
        }
      })
      .catch(function() {
        loading.classList.add('hidden');
        loginForm.classList.remove('hidden');
      });
  }

  loginForm.addEventListener('submit', function(e) {
    e.preventDefault();
    hideError('login-error');
    var btn = loginForm.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Signing in...';

    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        username: document.getElementById('login-user').value,
        password: document.getElementById('login-pass').value
      })
    })
    .then(function(r) {
      if (!r.ok) return r.json().then(function(d) { throw new Error(d.message || d.error || 'Login failed'); });
      window.location.replace('/');
    })
    .catch(function(err) {
      showError('login-error', err.message);
      btn.disabled = false;
      btn.textContent = 'Sign In';
    });
  });

  setupForm.addEventListener('submit', function(e) {
    e.preventDefault();
    hideError('setup-error');
    var pass = document.getElementById('setup-pass').value;
    var confirm = document.getElementById('setup-confirm').value;
    if (pass !== confirm) { showError('setup-error', 'Passwords do not match'); return; }
    if (pass.length < 8) { showError('setup-error', 'Password must be at least 8 characters'); return; }

    var btn = setupForm.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Creating...';

    fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        username: document.getElementById('setup-user').value,
        password: pass,
        setupToken: document.getElementById('setup-token').value || undefined
      })
    })
    .then(function(r) {
      if (!r.ok) return r.json().then(function(d) { throw new Error(d.message || d.error || 'Setup failed'); });
      window.location.replace('/');
    })
    .catch(function(err) {
      showError('setup-error', err.message);
      btn.disabled = false;
      btn.textContent = 'Create Account';
    });
  });
})();
