import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = path.join(DATA_DIR, 'poskedai.db');
export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS registrations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    gmail       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    full_name   TEXT    NOT NULL,
    store_name  TEXT,
    phone       TEXT,
    city        TEXT,
    device      TEXT,
    source      TEXT    DEFAULT 'landing',
    notes       TEXT,
    ip          TEXT,
    user_agent  TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now','+7 hours')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now','+7 hours'))
  );
`);

db.exec('CREATE INDEX IF NOT EXISTS idx_reg_created ON registrations(created_at DESC);');

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_logins (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT NOT NULL,
    ip         TEXT,
    user_agent TEXT,
    success    INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','+7 hours'))
  );
`);

export const q = {
  insertRegistration: db.prepare(`
    INSERT INTO registrations (gmail, full_name, store_name, phone, city, device, source, notes, ip, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  findByGmail: db.prepare('SELECT * FROM registrations WHERE gmail = ? COLLATE NOCASE'),
  listAll: db.prepare('SELECT * FROM registrations ORDER BY id DESC'),
  listPaged: db.prepare('SELECT * FROM registrations ORDER BY id DESC LIMIT ? OFFSET ?'),
  countAll: db.prepare('SELECT COUNT(*) AS n FROM registrations'),
  countToday: db.prepare(`SELECT COUNT(*) AS n FROM registrations WHERE date(created_at) = date('now','+7 hours')`),
  count7d: db.prepare(`SELECT COUNT(*) AS n FROM registrations WHERE created_at >= datetime('now','+7 hours','-7 days')`),
  topCities: db.prepare(`
    SELECT city, COUNT(*) AS n FROM registrations
    WHERE city IS NOT NULL AND trim(city) <> ''
    GROUP BY lower(city) ORDER BY n DESC LIMIT 5
  `),
  deleteById: db.prepare('DELETE FROM registrations WHERE id = ?'),
  countBeforeDelete: db.prepare('SELECT COUNT(*) AS n FROM registrations'),
  deleteAll: db.prepare('DELETE FROM registrations'),
  logLogin: db.prepare('INSERT INTO admin_logins (username, ip, user_agent, success) VALUES (?, ?, ?, ?)'),
  recentLogins: db.prepare('SELECT * FROM admin_logins ORDER BY id DESC LIMIT 20'),
};
