// Independent RFC4180-style reader, used to check actual exported files.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if (c === '\r' && source[i + 1] === '\n' && !quoted) { row.push(field); rows.push(row); row = []; field = ''; i++; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (quoted) throw new Error('unterminated CSV field');
  return rows;
}
