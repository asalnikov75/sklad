// Minimal CSV reader/writer (RFC 4180 quoting). Handles BOM, auto-detects , ; or tab, and is safe for Excel.

export function detectDelimiter(text) {
  const first = text.split(/\r?\n/, 1)[0] || '';
  let best = ',', n = -1;
  for (const d of [';', ',', '\t']) {
    let inQ = false, c = 0;
    for (const ch of first) { if (ch === '"') inQ = !inQ; else if (ch === d && !inQ) c++; }
    if (c > n) { n = c; best = d; }
  }
  return best;
}

/** -> array of rows (arrays of strings). */
export function parseCsv(text, delimiter) {
  text = String(text).replace(/^﻿/, '');
  const d = delimiter || detectDelimiter(text);
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === d) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

/** Spreadsheet formula injection guard: cells starting with = + - @ are prefixed with an apostrophe. */
const safe = (v) => {
  const s = v == null ? '' : String(v);
  return /^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s) ? `'${s}` : s;
};

/** Semicolon + BOM by default: opens correctly in Excel with a Bulgarian locale. */
export function toCsv(rows, { delimiter = ';', bom = true } = {}) {
  const q = (v) => {
    const s = safe(v);
    return /["\n\r;,\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return (bom ? '﻿' : '') + rows.map((r) => r.map(q).join(delimiter)).join('\r\n') + '\r\n';
}
