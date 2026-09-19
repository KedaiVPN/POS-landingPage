/* ══════════════════════════════════════════════════════════
   POS Kedai — Admin dashboard
   ══════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);

  const state = {
    page: 1,
    perPage: 25,
    q: '',
    from: '',
    to: '',
    sortKey: 'created_at',
    sortDir: 'desc',
    rows: [],
    pagination: { page: 1, total: 0, total_pages: 1, per_page: 25 },
    pendingDeleteId: null,
    grandTotal: null,   // true total across all rows, NOT the filtered count
  };

  /* ─────────────── utils ─────────────── */
  const toastEl = $('#toast');
  let toastTimer;
  function toast(msg, kind = 'ok') {
    toastEl.textContent = msg;
    toastEl.className = `adm-toast ${kind}`;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3200);
  }

  function esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtDate(s) {
    if (!s) return '—';
    const d = new Date(String(s).replace(' ', 'T') + '+07:00');
    if (Number.isNaN(d.getTime())) return esc(s);
    return d.toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  async function api(url, opts = {}) {
    const res = await fetch(url, { credentials: 'same-origin', ...opts });
    if (res.status === 401) {
      window.location.replace('/admin/login.html?reason=unauthorized');
      throw new Error('unauthorized');
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) throw new Error(json.message || `HTTP ${res.status}`);
    return json;
  }

  /* ─────────────── session ─────────────── */
  async function loadMe() {
    try {
      const j = await api('/api/admin/me');
      const user = j.data.user;
      $('#admUser').textContent = user;
      $('#admAvatar').textContent = (user[0] || 'A').toUpperCase();
    } catch { /* redirect handled in api() */ }
  }

  $('#logoutBtn').addEventListener('click', async () => {
    try { await api('/api/admin/logout', { method: 'POST' }); } catch { /* ignore */ }
    window.location.replace('/admin/login.html');
  });

  /* ─────────────── summary ─────────────── */
  async function loadSummary() {
    try {
      const j = await api('/api/admin/summary');
      const d = j.data;
      $('#stTotal').textContent = (d.total ?? 0).toLocaleString('id-ID');
      state.grandTotal = d.total ?? 0;
      $('#stToday').textContent = (d.today ?? 0).toLocaleString('id-ID');
      $('#stWeek').textContent = (d.week ?? 0).toLocaleString('id-ID');
      $('#stCity').textContent = d.cities?.[0]?.city || '—';
      $('#stCity').style.fontSize = d.cities?.[0]?.city ? '1.15rem' : '1.5rem';

      const lb = $('#loginBody');
      if (!d.logins?.length) {
        lb.innerHTML = '<tr><td colspan="4" class="adm-empty">Belum ada riwayat login.</td></tr>';
      } else {
        lb.innerHTML = d.logins.map((l) => `
          <tr>
            <td class="cell-date">${esc(fmtDate(l.created_at))}</td>
            <td>${esc(l.username)}</td>
            <td class="cell-muted">${esc(l.ip || '—')}</td>
            <td><span class="badge ${l.success ? 'ok' : 'bad'}">${l.success ? 'Berhasil' : 'Gagal'}</span></td>
          </tr>`).join('');
      }
    } catch (e) {
      if (e.message !== 'unauthorized') toast('Gagal memuat ringkasan', 'err');
    }
  }

  /* ─────────────── table ─────────────── */
  function renderTable() {
    const tb = $('#regBody');
    const rows = state.rows;

    if (!rows.length) {
      tb.innerHTML = `<tr><td colspan="8" class="adm-empty">
        ${state.q || state.from || state.to ? 'Tidak ada data yang cocok dengan filter.' : 'Belum ada pendaftar. Bagikan halaman landing untuk mulai mengumpulkan data.'}
      </td></tr>`;
    } else {
      tb.innerHTML = rows.map((r, i) => {
        const num = (state.pagination.page - 1) * state.pagination.per_page + i + 1;
        return `<tr>
          <td class="cell-muted">${num}</td>
          <td class="cell-gmail">${esc(r.gmail)}</td>
          <td>${esc(r.full_name)}</td>
          <td>${r.store_name ? esc(r.store_name) : '<span class="cell-muted">—</span>'}</td>
          <td>${r.phone ? esc(r.phone) : '<span class="cell-muted">—</span>'}</td>
          <td>${r.city ? esc(r.city) : '<span class="cell-muted">—</span>'}</td>
          <td class="cell-date">${esc(fmtDate(r.created_at))}</td>
          <td>
            <button class="btn-icon" data-del="${r.id}" title="Hapus" aria-label="Hapus ${esc(r.gmail)}">🗑</button>
          </td>
        </tr>`;
      }).join('');
    }

    const p = state.pagination;
    const shown = rows.length;
    const startIdx = p.total ? (p.page - 1) * p.per_page + 1 : 0;
    $('#pagerInfo').textContent = p.total
      ? `Menampilkan ${startIdx}–${startIdx + shown - 1} dari ${p.total.toLocaleString('id-ID')} pendaftar`
      : 'Tidak ada data';
    $('#pageNum').textContent = `${p.page} / ${p.total_pages}`;
    $('#prevPage').disabled = p.page <= 1;
    $('#nextPage').disabled = p.page >= p.total_pages;

    // sort indicators
    document.querySelectorAll('.adm-table th[data-sort]').forEach((th) => {
      const active = th.dataset.sort === state.sortKey;
      th.classList.toggle('sorted', active);
      const ind = th.querySelector('.sort-ind');
      if (ind) ind.textContent = active ? (state.sortDir === 'asc' ? '▲' : '▼') : '↕';
    });
  }

  async function loadTable() {
    const params = new URLSearchParams({
      page: String(state.page),
      per_page: String(state.perPage),
      sort: state.sortKey,
      dir: state.sortDir,
    });
    if (state.q) params.set('q', state.q);
    if (state.from) params.set('from', state.from);
    if (state.to) params.set('to', state.to);

    try {
      const j = await api(`/api/admin/registrations?${params}`);
      state.rows = j.data.items;
      state.pagination = j.data.pagination;
      renderTable();
    } catch (e) {
      if (e.message !== 'unauthorized') {
        $('#regBody').innerHTML = `<tr><td colspan="8" class="adm-empty">Gagal memuat data: ${esc(e.message)}</td></tr>`;
        toast('Gagal memuat data', 'err');
      }
    }
  }

  async function refreshAll() {
    await Promise.all([loadTable(), loadSummary()]);
  }

  /* ─────────────── filters ─────────────── */
  let searchTimer;
  $('#searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = e.target.value.trim();
      state.page = 1;
      loadTable();
    }, 320);
  });

  $('#fromDate').addEventListener('change', (e) => { state.from = e.target.value; state.page = 1; loadTable(); });
  $('#toDate').addEventListener('change', (e) => { state.to = e.target.value; state.page = 1; loadTable(); });
  $('#perPage').addEventListener('change', (e) => {
    const n = parseInt(e.target.value, 10);
    state.perPage = Number.isFinite(n) && n > 0 ? n : 25;
    state.page = 1;
    loadTable();
  });

  $('#resetFilter').addEventListener('click', () => {
    state.q = ''; state.from = ''; state.to = ''; state.page = 1;
    $('#searchInput').value = '';
    $('#fromDate').value = '';
    $('#toDate').value = '';
    state.sortKey = 'created_at'; state.sortDir = 'desc';
    loadTable();
  });

  $('#prevPage').addEventListener('click', () => {
    if (state.page > 1) { state.page -= 1; loadTable(); window.scrollTo({ top: 220, behavior: 'smooth' }); }
  });
  $('#nextPage').addEventListener('click', () => {
    if (state.page < state.pagination.total_pages) { state.page += 1; loadTable(); window.scrollTo({ top: 220, behavior: 'smooth' }); }
  });

  document.querySelectorAll('.adm-table th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDir = key === 'created_at' ? 'desc' : 'asc';
      }
      state.page = 1;
      loadTable();
    });
  });

  $('#refreshBtn').addEventListener('click', () => { refreshAll(); toast('Data dimuat ulang'); });

  /* ─────────────── delete ─────────────── */
  const modal = $('#confirmModal');
  const closeModal = () => {
    modal.hidden = true;
    state.pendingDeleteId = null;
  };

  $('#regBody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    state.pendingDeleteId = Number(btn.dataset.del);
    const email = btn.closest('tr')?.querySelector('.cell-gmail')?.textContent || 'data ini';
    $('#confirmText').textContent = `Gmail "${email}" akan dihapus permanen dari daftar pra-registrasi.`;
    modal.hidden = false;
    $('#cancelDelete').focus();
  });

  $('#cancelDelete').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  $('#confirmDelete').addEventListener('click', async () => {
    const id = state.pendingDeleteId;
    if (!id) { closeModal(); return; }
    try {
      await api(`/api/admin/registrations/${id}`, { method: 'DELETE' });
      closeModal();
      toast('Data berhasil dihapus');
      await refreshAll();
    } catch (e) {
      closeModal();
      if (e.message !== 'unauthorized') toast(e.message || 'Gagal menghapus', 'err');
    }
  });

  /* ─────────────── export feedback ─────────────── */
  ['#exportXlsxBtn', '#exportXlsBtn'].forEach((sel) => {
    $(sel)?.addEventListener('click', () => toast('Menyiapkan file… file akan terunduh otomatis', 'ok'));
  });
  ['#emailTxtBtn', '#emailCsvBtn', '#emailXlsxBtn', '#emailXlsBtn'].forEach((sel) => {
    $(sel)?.addEventListener('click', () => toast('Mengunduh daftar email saja…', 'ok'));
  });

  /* ─────────────── purge all ─────────────── */
  const purgeModal = $('#purgeModal');
  const closePurge = () => { purgeModal.hidden = true; };

  $('#purgeAllBtn').addEventListener('click', () => {
    const total = state.grandTotal;
    let msg;
    if (total === null) {
      msg = 'Seluruh data pendaftar akan dihapus permanen dan tidak bisa dikembalikan.';
    } else if (total === 0) {
      msg = 'Belum ada data pendaftar untuk dihapus.';
    } else {
      msg = `Seluruh ${total.toLocaleString('id-ID')} data pendaftar akan dihapus permanen dan tidak bisa dikembalikan.`;
      // spell it out: the purge ignores any filter that is currently applied
      if (state.q || state.from || state.to) {
        msg += ' Semua baris akan terhapus, termasuk yang sedang tersembunyi oleh filter.';
      }
    }
    $('#purgeText').textContent = msg;
    purgeModal.hidden = false;
    $('#cancelPurge').focus();
  });

  $('#cancelPurge').addEventListener('click', closePurge);
  purgeModal.addEventListener('click', (e) => { if (e.target === purgeModal) closePurge(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !purgeModal.hidden) closePurge();
  });

  $('#confirmPurge').addEventListener('click', async () => {
    try {
      const j = await api('/api/admin/registrations/all', { method: 'DELETE' });
      closePurge();
      toast(j.message || 'Semua data berhasil dihapus');
      state.page = 1;
      await refreshAll();
    } catch (e) {
      closePurge();
      if (e.message !== 'unauthorized') toast(e.message || 'Gagal menghapus data', 'err');
    }
  });

  /* ─────────────── init ─────────────── */
  loadMe();
  refreshAll();
})();
