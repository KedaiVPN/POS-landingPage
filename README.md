# POS Kedai — Landing Page Pra-Registrasi + Admin Dashboard

Website landing page untuk pra-registrasi aplikasi **POS Kedai** (aplikasi kasir Android
offline-first untuk toko, warung, dan kedai), lengkap dengan admin dashboard berlogin untuk
mengelola data pendaftar dan mengekspornya ke Excel.

---

## Fitur

**Landing page publik** (dioptimalkan untuk iklan berbayar)
- Hero berbasis manfaat ("Kasir di HP Anda. Laba langsung kelihatan."), bukan daftar fitur
- **Seksi Bonus Pro** — penawaran utama: Pro gratis 2 bulan untuk pendaftar pra-registrasi
- 6 kartu Keunggulan berorientasi hasil, bukan istilah teknis
  (tanpa "OTP", "Room/SQLite", "WorkManager", "role" — jargon internal dibuang)
- Alur cara daftar, FAQ (termasuk penjelasan bonus Pro), testimoni, dan CTA
- Form pra-registrasi ringkas: Gmail, nama lengkap, nama toko, WhatsApp, kota
  (field "perangkat" & "catatan" dibuang — friksi berlebih untuk iklan)
- **Validasi Gmail** — hanya `@gmail.com` / `@googlemail.com` (sesuai akun Google Play Store)
- Validasi ganda: sisi klien (instan) dan sisi server (otoritatif)
- Deteksi Gmail duplikat dengan pesan informatif
- Counter pendaftar live + animasi scroll reveal
- Responsif penuh (diuji 320/360/390/414/768/1340px, tanpa overflow horizontal)
- Halaman 404 kustom

**Admin dashboard** (`/admin/login.html`)
- Login dengan kredensial dari `.env`
- Sesi bertanda HMAC-SHA256, cookie `httpOnly` + `SameSite=Lax`, kedaluwarsa 24 jam
- Perbandingan kredensial memakai `timingSafeEqual` (anti timing-attack)
- Kartu statistik: total pendaftar, hari ini, 7 hari terakhir, kota teratas
- Tabel data: pencarian, filter rentang tanggal, sorting per kolom, paginasi
- Hapus data dengan modal konfirmasi
- Riwayat percobaan login admin (berhasil/gagal + IP)
- Tombol download **`.xlsx`** dan **`.xls`** — data lengkap
- Tombol download **email saja** (`.txt`, `.csv`, `.xlsx`, `.xls`) — hanya alamat Gmail,
  berguna untuk broadcast tanpa ikut mengekspos nama/nomor telepon pendaftar

---

## Persyaratan

- **Node.js ≥ 22.5.0** (memakai modul bawaan `node:sqlite` — tidak perlu install SQLite terpisah)

Cek versi: `node -v`

---

## Instalasi

```bash
cd pos-kedai-landing
npm install
cp .env.example .env      # lalu ubah kredensialnya
npm start
```

Buka:
- Landing page → http://localhost:3000/
- Admin login → http://localhost:3000/admin/login.html

Mode development dengan auto-reload: `npm run dev`

---

## Konfigurasi `.env`

```env
PORT=3000
HOST=0.0.0.0

# Kredensial admin dashboard
ADMIN_USER=admin
ADMIN_PASS=KedaiAdmin2026!

# Kunci HMAC untuk tanda tangan sesi
SESSION_SECRET=ganti-dengan-string-acak-panjang

# Lokasi database SQLite
DATA_DIR=./data
```

### Wajib diganti sebelum live

| Variabel | Kenapa |
|---|---|
| `ADMIN_PASS` | Default ada di repo. Pakai password kuat & unik. |
| `SESSION_SECRET` | Kalau bocor, orang bisa memalsukan sesi admin. |

Buat secret acak:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> `.env` sudah masuk `.gitignore` — jangan pernah di-commit.

---

## Struktur proyek

```
pos-kedai-landing/
├── src/
│   ├── server.js            # Express app, semua route API
│   ├── db.js                # Skema SQLite + prepared statements
│   ├── auth.js              # Sesi HMAC, cek kredensial, middleware requireAdmin
│   └── xls.js               # Generator file .xlsx (ExcelJS) & .xls (SheetJS BIFF8)
├── public/
│   ├── index.html           # Landing page
│   ├── 404.html
│   ├── admin/
│   │   ├── login.html
│   │   └── dashboard.html
│   └── assets/
│       ├── style.css        # Desain landing page
│       ├── admin.css        # Desain admin
│       ├── app.js           # Interaksi form landing
│       ├── admin-login.js
│       ├── admin-dashboard.js
│       └── img/             # Aset visual
│           ├── logo-mark.png          # ikon logo (awning), dipakai nav + admin
│           ├── logo-full.png          # lockup penuh + wordmark (og:image)
│           ├── favicon-*.png          # 32/64/180/256 px
│           └── shot-statistik.webp    # screenshot asli (hero), bebas data uji
├── favicon.ico              # multi-size 16/32/48/64
├── data/                    # Dibuat otomatis — berisi poskedai.db
├── .env                     # JANGAN di-commit
└── .env.example
```

---

## API

### Publik
| Method | Endpoint | Keterangan |
|---|---|---|
| `POST` | `/api/register` | Kirim pra-registrasi |
| `GET` | `/api/stats/public` | Jumlah pendaftar (untuk counter) |

### Admin (butuh login)
| Method | Endpoint | Keterangan |
|---|---|---|
| `POST` | `/api/admin/login` | Login |
| `POST` | `/api/admin/logout` | Logout |
| `GET` | `/api/admin/me` | Cek sesi aktif |
| `GET` | `/api/admin/registrations` | Daftar data (`page`, `per_page`, `q`, `from`, `to`, `sort`, `dir`) |
| `GET` | `/api/admin/summary` | Statistik ringkas + riwayat login |
| `DELETE` | `/api/admin/registrations/:id` | Hapus satu data |
| `DELETE` | `/api/admin/registrations/all` | **Hapus semua** data pra-registrasi |
| `GET` | `/api/admin/export/xlsx` | Download Excel (.xlsx, berformat) — data lengkap |
| `GET` | `/api/admin/export/xls` | Download Excel (.xls, BIFF8) — data lengkap |
| `GET` | `/api/admin/email/txt` | **Email saja** (plain text, 1 alamat per baris) |
| `GET` | `/api/admin/email/csv` | **Email saja** (CSV, kolom `email`) |
| `GET` | `/api/admin/email/xlsx` | **Email saja** (.xlsx berformat) |
| `GET` | `/api/admin/email/xls` | **Email saja** (.xls BIFF8) |

Semua endpoint `/api/admin/email/*` memakai grup path sendiri (`email/`) sehingga tidak
bertabrakan dengan `/api/admin/export/*`, dan **tidak** menyertakan nama, nama toko, nomor
WhatsApp, kota, IP, maupun user agent — hanya `gmail`. Diverifikasi lewat pembacaan ulang file:
tepat 2 kolom, tanpa sel bocor.

**Pakai path `/export/xlsx` dan `/export/xls` (tanpa titik), bukan `/export.xlsx`.**
Path ber-ekstensi masih berfungsi di origin, tapi CDN seperti Cloudflare men-cache
berdasarkan **ekstensi file** dan akan menyajikan hasil ekspor berisi seluruh email
pendaftar ke pengunjung anonim. Path tanpa ekstensi kebal terhadap aturan itu.

Semua respons `/api/*` juga mengirim `Cache-Control: no-store` + `CDN-Cache-Control: no-store`,
jadi tidak ada CDN yang boleh menyimpannya.

---

## Skema database

```sql
CREATE TABLE registrations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  gmail       TEXT NOT NULL UNIQUE COLLATE NOCASE,   -- unik, case-insensitive
  full_name   TEXT NOT NULL,
  store_name  TEXT,
  phone       TEXT,
  city        TEXT,
  device      TEXT,
  source      TEXT DEFAULT 'landing',
  notes       TEXT,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','+7 hours')),  -- WIB
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','+7 hours'))
);

CREATE TABLE admin_logins (   -- audit percobaan login
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT NOT NULL,
  ip         TEXT,
  user_agent TEXT,
  success    INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours'))
);
```

`UNIQUE COLLATE NOCASE` membuat `Izal@Gmail.com` dan `izal@gmail.com` dianggap sama —
mencegah satu orang mendaftar dua kali dengan kapitalisasi berbeda.

---

## Keamanan yang sudah diterapkan

- Kredensial hanya di `.env`, tidak pernah dikirim ke klien
- Password dibandingkan dengan `timingSafeEqual` (mencegah timing attack)
- Sesi ditandatangani HMAC-SHA256; cookie `httpOnly` + `SameSite=Lax` + `secure` otomatis di HTTPS
- Semua endpoint admin dijaga middleware `requireAdmin`; API mengembalikan **401 JSON**
  (bukan redirect) supaya `fetch` tidak pernah menelan HTML login
- Query SQL memakai *prepared statements* (anti SQL injection)
- Kolom sorting divalidasi terhadap whitelist (`SORTABLE`), bukan diinterpolasi bebas
- Input di-escape saat dirender di dashboard (`esc()`) — payload XSS tampil sebagai teks
- Semua input dipotong sesuai batas panjang di sisi server
- Body request dibatasi 256 KB
- Halaman admin diberi `noindex, nofollow`

---

## Deploy produksi

### Status deployment saat ini

Sudah live di **https://landing-page.free-account.my.id** (via Cloudflare).

| Komponen | Detail |
|---|---|
| Node | `/root/.local/share/mise/installs/node/lts/bin/node` |
| Proses | systemd unit `pos-kedai` (enabled, auto-start saat boot) |
| Web server | nginx vhost `/etc/nginx/sites-available/pos-kedai` |
| TLS | Let's Encrypt, auto-renew via `certbot.timer` |
| Database | `/root/pos-kedai-landing/data/poskedai.db` |
| Log aplikasi | `journalctl -u pos-kedai -f` |

Perintah operasional:

```bash
systemctl status pos-kedai      # cek status
systemctl restart pos-kedai     # restart setelah ubah .env / kode
journalctl -u pos-kedai -n 50   # lihat log
nginx -t && systemctl reload nginx
```

Menjalankan test terhadap server live:

```bash
export $(grep -E '^ADMIN_(USER|PASS)=' .env | xargs -d '\n')
BASE_URL=https://landing-page.free-account.my.id node test/e2e.js
```

### Langkah deploy umum

1. Set `NODE_ENV=production`, `ADMIN_PASS` kuat, dan `SESSION_SECRET` acak.
2. Jalankan di belakang reverse proxy (Nginx/Caddy) dengan **HTTPS** — cookie `secure`
   aktif otomatis lewat header `X-Forwarded-Proto`.
3. **Pastikan ada yang listen di port 443.** Kalau Cloudflare di mode SSL Full dan origin
   tidak punya listener 443, semua request HTTPS dari Cloudflare gagal dengan
   **HTTP 522** — padahal HTTP biasa di port 80 tetap jalan, jadi masalahnya mudah terlewat.
   Pasang sertifikat: `certbot --nginx -d domain-anda`.
4. Backup berkala folder `data/` (isi database). Dengan WAL aktif, aman menyalin
   `poskedai.db` saat server berjalan, tapi cara paling aman: hentikan proses atau
   pakai `sqlite3 poskedai.db ".backup backup.db"`.
5. Proses manager: `pm2 start src/server.js --name pos-kedai` atau unit `systemd`.

### Reverse proxy nginx

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name landing-page.free-account.my.id;

    client_max_body_size 2m;

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        # Cloudflare menutup TLS, jadi $scheme = http di sini. Paksa https
        # supaya cookie sesi memakai flag `secure`.
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

`certbot --nginx` menambahkan blok server 443 dan redirect 80→443 secara otomatis.

Contoh unit systemd:

```ini
[Unit]
Description=POS Kedai Landing & Admin
After=network.target

[Service]
Type=simple
WorkingDirectory=/root/pos-kedai-landing
ExecStart=/root/.local/share/mise/installs/node/lts/bin/node src/server.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production
User=root

[Install]
WantedBy=multi-user.target
```

---

## Catatan teknis

- **`.xls` asli, bukan HTML.** Ekspor `.xls` memakai format biner BIFF8 (Excel 97-2003)
  lewat SheetJS, sehingga Excel tidak menampilkan peringatan "format file tidak cocok".
- **Zona waktu.** `created_at` disimpan dalam WIB (UTC+7) lewat `datetime('now','+7 hours')`
  dan ditampilkan dengan `timeZone: 'Asia/Jakarta'`.
- **`node:sqlite`** masih ditandai eksperimental di Node 22/24, tapi stabil untuk beban
  seperti ini dan menghilangkan dependensi native (`better-sqlite3` perlu kompilasi).
  Kalau muncul peringatan di stderr, itu normal.
- **Filter & sort di sisi SQL.** Pencarian, filter tanggal, sorting, dan paginasi dijalankan
  di database — siap untuk puluhan ribu baris tanpa memuat semuanya ke memori.
- **Satu aset visual.** Landing page sengaja hanya memuat **satu** screenshot asli
  (`shot-statistik.webp`, 21 KB) di mockup HP pada hero. Galeri 6 screenshot dihapus dan foto
  influencer juga dihapus — section Testimoni kini teks saja (centered).
- **Logo: ikon dipisah dari wordmark.** Logo asli adalah lockup (awning di atas papan nama
  navy berisi teks "POS KEDAI") dengan rasio 1,25:1. Di nav, wordmark-nya jadi noda tak
  terbaca, sementara teks "POSKedai" di sebelahnya sudah menyampaikan nama brand — jadi ikon
  awning dipotong (`logo-mark.png`) dan wordmark dibiarkan dirender sebagai teks HTML. Ini juga
  memperbaiki bug: lockup 128×128 sebelumnya dipaksa `width:34px; height:34px` sehingga
  terdistorsi, dan wordmark tercetak dua kali.
- **Ukuran logo sengaja kecil.** Tinggi **26 px** di nav (22 px di layar <420 px), 48 px di
  kartu login admin, 32 px di topbar dashboard. Versi awal 34 px terasa kegedan dibanding
  tinggi teks brand, jadi diturunkan. Ditambah `transform: translateY(-1px)` untuk koreksi
  optis — massa visual logo ada di bawah titik tengah kotaknya.
- **Logo di-key dari background hitam, bukan biru.** Sumber akhir berformat JPEG dengan
  background **hitam pekat** (#000000, ~69% luas) dan artwork dua nada: navy `#16376c` +
  putih tulang `#e9f1fb`. Alphanya dihitung dari luminance (`a = (v - 30) / (205 - 30)`) lalu
  warna di-flatten ke dua nada tersebut — bukan threshold keras. Transisi navy↔putih dibuat
  bertahap (`t` di sekitar ambang 188 ± 46) supaya sambungan scallop awning dengan kubah
  tidak bergerigi; pada 26 px takik aslinya memang sub-piksel. Bintik JPEG dibersihkan dengan
  `MedianFilter(5)` pada kanal alpha, lalu diturunkan ke 146 px supaya noise-nya rata.
- **Favicon tidak diubah.** `favicon-32/64/180/256.png` dan `favicon.ico` tetap memakai versi
  ber-plate biru muda (tidak di-key), sesuai permintaan. Diverifikasi dengan md5 lokal vs live.
- **Angka di kartu melayang konsisten dengan screenshot.** Kartu "Pendapatan bersih" memakai
  Rp 80.300, angka yang benar-benar terlihat pada `shot-statistik.webp` — bukan angka karangan.
