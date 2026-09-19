import ExcelJS from 'exceljs';
import XLSX from 'xlsx';

/* ─────────── email-only export ─────────── */

const EMAIL_HEADERS = [
  { header: 'No', key: 'no', width: 6 },
  { header: 'Gmail (Google Play)', key: 'gmail', width: 40 },
];

const EMAIL_FLAT_HEADERS = ['No', 'Gmail (Google Play)'];

function toEmailRows(rows) {
  return rows.map((r, idx) => ({ no: idx + 1, gmail: r.gmail }));
}

/** Plain text, one address per line — pastes straight into a mail client's BCC. */
export function buildEmailTxt(rows) {
  return rows.map((r) => r.gmail).join('\r\n');
}

/** CSV with a single `email` column. */
export function buildEmailCsv(rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return ['email', ...rows.map((r) => esc(r.gmail))].join('\r\n');
}

/* ─────────── full export ─────────── */

const HEADERS = [
  { header: 'No', key: 'no', width: 6 },
  { header: 'Gmail (Google Play)', key: 'gmail', width: 34 },
  { header: 'Nama Lengkap', key: 'full_name', width: 24 },
  { header: 'Nama Toko', key: 'store_name', width: 24 },
  { header: 'No. WhatsApp', key: 'phone', width: 18 },
  { header: 'Kota', key: 'city', width: 18 },
  { header: 'Perangkat', key: 'device', width: 14 },
  { header: 'Sumber', key: 'source', width: 12 },
  { header: 'Tanggal Daftar', key: 'created_at', width: 22 },
];

const FLAT_HEADERS = [
  'No',
  'Gmail (Google Play)',
  'Nama Lengkap',
  'Nama Toko',
  'No. WhatsApp',
  'Kota',
  'Perangkat',
  'Sumber',
  'Tanggal Daftar',
];

function toRows(rows) {
  return rows.map((r, idx) => ({
    no: idx + 1,
    gmail: r.gmail,
    full_name: r.full_name,
    store_name: r.store_name || '-',
    phone: r.phone || '-',
    city: r.city || '-',
    device: r.device || '-',
    source: r.source || 'landing',
    created_at: r.created_at,
  }));
}

/* ─────────── .xlsx (ExcelJS — berformat, dengan judul & autofilter) ─────────── */

export async function buildWorkbookBuffer(rows) {
  const data = toRows(rows);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'POS Kedai';
  wb.created = new Date();

  const ws = wb.addWorksheet('Pra-Registrasi', {
    views: [{ state: 'frozen', ySplit: 3 }],
    properties: { defaultRowHeight: 18 },
  });

  ws.columns = HEADERS;

  // Title banner
  ws.mergeCells(1, 1, 1, HEADERS.length);
  const title = ws.getCell('A1');
  title.value = 'DATA PRA-REGISTRASI — POS KEDAI';
  title.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  ws.getRow(1).height = 30;

  ws.mergeCells(2, 1, 2, HEADERS.length);
  const sub = ws.getCell('A2');
  sub.value = `Total: ${data.length} pendaftar  •  Diekspor: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`;
  sub.font = { italic: true, size: 10, color: { argb: 'FF475569' } };
  sub.alignment = { horizontal: 'center' };
  ws.getRow(2).height = 18;

  // Header row
  const headerRow = ws.getRow(3);
  HEADERS.forEach((h, i) => {
    const c = headerRow.getCell(i + 1);
    c.value = h.header;
    c.font = { bold: true, color: { argb: 'FF0F172A' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCFBF1' } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      left: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
      right: { style: 'thin', color: { argb: 'FF94A3B8' } },
    };
  });
  headerRow.height = 26;

  data.forEach((r, idx) => {
    const row = ws.addRow(r);
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'hair', color: { argb: 'FFE2E8F0' } },
        left: { style: 'hair', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
        right: { style: 'hair', color: { argb: 'FFE2E8F0' } },
      };
      cell.alignment = { vertical: 'middle' };
    });
    if (idx % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      });
    }
  });

  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: HEADERS.length } };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/* ─────────── .xls (SheetJS BIFF8 — file Excel biner asli) ─────────── */

export function buildBiff8Buffer(rows) {
  const data = toRows(rows);

  const aoa = [
    [`DATA PRA-REGISTRASI — POS KEDAI`],
    [`Total: ${data.length} pendaftar  •  Diekspor: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`],
    FLAT_HEADERS,
    ...data.map((r) => [
      r.no,
      r.gmail,
      r.full_name,
      r.store_name,
      r.phone,
      r.city,
      r.device,
      r.source,
      r.created_at,
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = HEADERS.map((h) => ({ wch: h.width }));
  ws['!autofilter'] = {
    ref: XLSX.utils.encode_range({ s: { r: 2, c: 0 }, e: { r: 2 + data.length, c: FLAT_HEADERS.length - 1 } }),
  };
  ws['!freeze'] = { xSplit: 0, ySplit: 3 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pra-Registrasi');

  return XLSX.write(wb, { bookType: 'biff8', type: 'buffer', compression: true });
}

/* ─────────── email-only .xlsx ─────────── */

export async function buildEmailWorkbookBuffer(rows) {
  const data = toEmailRows(rows);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'POS Kedai';
  wb.created = new Date();

  const ws = wb.addWorksheet('Email Pendaftar', {
    views: [{ state: 'frozen', ySplit: 3 }],
    properties: { defaultRowHeight: 18 },
  });

  ws.columns = EMAIL_HEADERS;

  ws.mergeCells(1, 1, 1, EMAIL_HEADERS.length);
  const title = ws.getCell('A1');
  title.value = 'EMAIL PENDAFTAR — POS KEDAI';
  title.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  ws.getRow(1).height = 30;

  ws.mergeCells(2, 1, 2, EMAIL_HEADERS.length);
  const sub = ws.getCell('A2');
  sub.value = `Total: ${data.length} email  •  Diekspor: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`;
  sub.font = { italic: true, size: 10, color: { argb: 'FF475569' } };
  sub.alignment = { horizontal: 'center' };
  ws.getRow(2).height = 18;

  const headerRow = ws.getRow(3);
  EMAIL_HEADERS.forEach((h, i) => {
    const c = headerRow.getCell(i + 1);
    c.value = h.header;
    c.font = { bold: true, color: { argb: 'FF0F172A' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCFBF1' } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      left: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
      right: { style: 'thin', color: { argb: 'FF94A3B8' } },
    };
  });
  headerRow.height = 26;

  data.forEach((r, idx) => {
    const row = ws.addRow(r);
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'hair', color: { argb: 'FFE2E8F0' } },
        left: { style: 'hair', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
        right: { style: 'hair', color: { argb: 'FFE2E8F0' } },
      };
      cell.alignment = { vertical: 'middle' };
    });
    if (idx % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      });
    }
  });

  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: EMAIL_HEADERS.length } };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/* ─────────── email-only .xls ─────────── */

export function buildEmailBiff8Buffer(rows) {
  const data = toEmailRows(rows);

  const aoa = [
    ['EMAIL PENDAFTAR — POS KEDAI'],
    [`Total: ${data.length} email  •  Diekspor: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`],
    EMAIL_FLAT_HEADERS,
    ...data.map((r) => [r.no, r.gmail]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = EMAIL_HEADERS.map((h) => ({ wch: h.width }));
  ws['!autofilter'] = {
    ref: XLSX.utils.encode_range({ s: { r: 2, c: 0 }, e: { r: 2 + data.length, c: EMAIL_FLAT_HEADERS.length - 1 } }),
  };
  ws['!freeze'] = { xSplit: 0, ySplit: 3 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Email Pendaftar');

  return XLSX.write(wb, { bookType: 'biff8', type: 'buffer', compression: true });
}
