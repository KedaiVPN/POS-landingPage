/* ══════════════════════════════════════════════════════════
   POS Kedai — Admin login
   ══════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const form = document.getElementById('loginForm');
  if (!form) return;

  const btn = document.getElementById('loginBtn');
  const label = btn.querySelector('.btn-label');
  const spinner = btn.querySelector('.spinner');
  const alertBox = document.getElementById('loginAlert');
  const toggle = document.getElementById('passToggle');
  const passInput = document.getElementById('password');

  // already logged in? go straight to dashboard
  (async () => {
    try {
      const r = await fetch('/api/admin/me');
      if (r.ok) window.location.replace('/admin/dashboard.html');
    } catch { /* ignore */ }
  })();

  const params = new URLSearchParams(location.search);
  if (params.get('reason') === 'unauthorized') {
    showAlert('Sesi berakhir atau Anda belum login. Silakan masuk kembali.', 'info');
  }

  function showAlert(msg, kind = 'error') {
    alertBox.textContent = msg;
    alertBox.className = `form-alert ${kind}`;
    alertBox.hidden = false;
  }
  function splash() {
    alertBox.hidden = true;
  }

  function loading(on) {
    btn.disabled = on;
    label.textContent = on ? 'Memproses…' : 'Masuk Dashboard';
    spinner.hidden = !on;
  }

  toggle?.addEventListener('click', () => {
    const showing = passInput.type === 'text';
    passInput.type = showing ? 'password' : 'text';
    toggle.textContent = showing ? '👁' : '🙈';
    toggle.setAttribute('aria-label', showing ? 'Tampilkan password' : 'Sembunyikan password');
    passInput.focus();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    splash();

    const username = form.username.value.trim();
    const password = form.password.value;

    if (!username || !password) {
      showAlert('Username dan password wajib diisi.');
      return;
    }

    loading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json().catch(() => ({}));

      if (res.ok && json.success) {
        label.textContent = 'Berhasil! Mengalihkan…';
        window.location.replace(json.redirect || '/admin/dashboard.html');
        return;
      }

      showAlert(json.message || 'Login gagal. Periksa kembali kredensial Anda.');
      form.password.value = '';
      form.password.focus();
    } catch {
      showAlert('Tidak dapat menghubungi server. Coba beberapa saat lagi.');
    } finally {
      loading(false);
    }
  });
})();
