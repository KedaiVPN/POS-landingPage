/* ══════════════════════════════════════════════════════════
   POS Kedai — Landing page interactions
   ══════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- year ---------- */
  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- nav shadow on scroll ---------- */
  const nav = $('#nav');
  const onScroll = () => nav?.classList.toggle('scrolled', window.scrollY > 12);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- reveal on scroll ---------- */
  const revealTargets = $$('.feat-card, .step, .section-head, .form-side, .form-card, .trust-item, .faq-item');
  revealTargets.forEach((el) => el.classList.add('reveal'));

  const revealAll = () => revealTargets.forEach((el) => el.classList.add('in'));

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e, i) => {
          if (e.isIntersecting) {
            setTimeout(() => e.target.classList.add('in'), i * 55);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    );
    revealTargets.forEach((el) => io.observe(el));

    // Safety net: never leave content invisible if the observer misfires
    window.addEventListener('load', () => {
      setTimeout(() => {
        revealTargets.forEach((el) => {
          if (!el.classList.contains('in') && el.getBoundingClientRect().top < window.innerHeight) {
            el.classList.add('in');
          }
        });
      }, 1200);
    });
  } else {
    revealAll();
  }

  /* ---------- public counter ---------- */
  (async () => {
    try {
      const r = await fetch('/api/stats/public');
      const j = await r.json();
      if (j?.success) {
        const n = j.data.total ?? 0;
        const el = $('#statTotal');
        if (el) {
          // count-up animation
          const dur = 900;
          const start = performance.now();
          const step = (t) => {
            const p = Math.min(1, (t - start) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.round(n * eased).toLocaleString('id-ID');
            if (p < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      }
    } catch { /* silent */ }
  })();

  /* ---------- form ---------- */
  const form = $('#regForm');
  if (!form) return;

  const submitBtn = $('#submitBtn');
  const btnLabel = $('.btn-label', submitBtn);
  const spinner = $('.spinner', submitBtn);
  const formAlert = $('#formAlert');
  const formSuccess = $('#formSuccess');
  const successMsg = $('#successMsg');
  const successEmail = $('#successEmail');
  const againBtn = $('#againBtn');
  const consent = $('#consent');

  const GMAIL_RE = /^[a-z0-9](?:[a-z0-9._%+-]{4,28})[a-z0-9]@(gmail|googlemail)\.com$/i;

  function setError(name, msg) {
    const errEl = $(`[data-err="${name}"]`);
    const input = form.querySelector(`[name="${name}"]`) || (name === 'consent' ? consent : null);
    if (errEl) {
      errEl.textContent = msg || '';
      errEl.classList.toggle('show', !!msg);
    }
    if (input && input.classList.contains('invalid') !== !!msg) {
      input.classList.toggle('invalid', !!msg);
    }
  }

  function clearErrors() {
    $$('.err', form).forEach((e) => { e.textContent = ''; e.classList.remove('show'); });
    $$('.invalid', form).forEach((e) => e.classList.remove('invalid'));
    hideAlert();
  }

  function showAlert(msg, kind = 'error') {
    if (!formAlert) return;
    formAlert.textContent = msg;
    formAlert.className = `form-alert ${kind}`;
    formAlert.hidden = false;
  }
  function hideAlert() {
    if (formAlert) formAlert.hidden = true;
  }

  function validate() {
    clearErrors();
    let ok = true;

    const gmail = form.gmail.value.trim().toLowerCase();
    if (!gmail) { setError('gmail', 'Gmail wajib diisi.'); ok = false; }
    else if (!GMAIL_RE.test(gmail)) {
      setError('gmail', 'Gunakan Gmail aktif berakhiran @gmail.com (bukan email domain lain).');
      ok = false;
    }

    const fullName = form.full_name.value.trim();
    if (fullName.length < 3) { setError('full_name', 'Nama lengkap minimal 3 karakter.'); ok = false; }

    const phone = form.phone.value.trim();
    const digits = phone.replace(/\D/g, '');
    if (!phone) { setError('phone', 'Nomor WhatsApp wajib diisi.'); ok = false; }
    else if (digits.length < 9 || digits.length > 15) {
      setError('phone', 'Nomor WhatsApp tidak valid (9–15 digit).');
      ok = false;
    }

    const storeName = form.store_name.value.trim();
    if (storeName && storeName.length < 2) { setError('store_name', 'Nama toko terlalu pendek.'); ok = false; }

    if (!consent.checked) { setError('consent', 'Anda harus menyetujui penggunaan Gmail ini.'); ok = false; }

    return ok;
  }

  // live-clear errors as the user types
  ['gmail', 'full_name', 'phone', 'store_name'].forEach((n) => {
    const el = form.querySelector(`[name="${n}"]`);
    el?.addEventListener('input', () => {
      setError(n, '');
      if (n === 'gmail') {
        const v = el.value.trim();
        if (v && GMAIL_RE.test(v)) el.classList.remove('invalid');
      }
    });
  });
  consent?.addEventListener('change', () => { if (consent.checked) setError('consent', ''); });

  function setLoading(on) {
    submitBtn.disabled = on;
    if (btnLabel) btnLabel.textContent = on ? 'Mengirim…' : 'Klaim Pro Gratis 2 Bulan';
    if (spinner) spinner.hidden = !on;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate()) {
      const firstBad = $('.invalid', form) || $('.err.show', form);
      firstBad?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setLoading(true);
    hideAlert();

    const payload = {
      gmail: form.gmail.value.trim().toLowerCase(),
      full_name: form.full_name.value.trim(),
      store_name: form.store_name.value.trim(),
      phone: form.phone.value.trim(),
      city: form.city.value.trim(),
    };

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));

      if (res.ok && json.success) {
        successEmail.textContent = payload.gmail;
        successMsg.textContent = json.message;
        form.hidden = true;
        formSuccess.hidden = false;
        formSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      if (json.errors) {
        Object.entries(json.errors).forEach(([k, v]) => setError(k, v));
      }

      if (json.duplicate) {
        showAlert(json.message + (json.already_since ? ` Terdaftar pada ${json.already_since}.` : ''), 'info');
      } else {
        showAlert(json.message || 'Gagal mengirim data. Coba lagi.');
      }
    } catch {
      showAlert('Tidak dapat menghubungi server. Periksa koneksi Anda lalu coba lagi.');
    } finally {
      setLoading(false);
    }
  });

  againBtn?.addEventListener('click', () => {
    form.reset();
    clearErrors();
    formSuccess.hidden = true;
    form.hidden = false;
    form.gmail.focus();
  });

  /* ---------- smooth anchor offset ---------- */
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (ev) => {
      const id = a.getAttribute('href');
      if (id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      ev.preventDefault();
      const y = target.getBoundingClientRect().top + window.scrollY - 74;
      window.scrollTo({ top: y, behavior: 'smooth' });
    });
  });
})();
