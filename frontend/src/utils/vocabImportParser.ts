import * as XLSX from 'xlsx';

export interface ParsedRow { term: string; definition: string }

/** Parse an xlsx/csv file into {term, definition}[]. Reads the FIRST sheet.
 * Uses the first row as header if it contains something like "term"/"definition"
 * or "français"/"español"; otherwise takes cols A and B as term/definition. */
export async function parseSpreadsheet(file: File): Promise<ParsedRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rows.length === 0) return [];

  const firstRow = rows[0].map((c: any) => String(c ?? '').toLowerCase().trim());
  const looksLikeHeader = firstRow.some((c) =>
    /^(term|word|palabra|français|francais|français|french|espa[ñn]ol|spanish|definition|definici[oó]n|traducci[oó]n|meaning)$/i.test(c)
  );

  // Find term/definition columns
  let termCol = 0;
  let defCol = 1;
  if (looksLikeHeader) {
    firstRow.forEach((c, i) => {
      if (/^(term|word|palabra|français|francais|french)$/i.test(c)) termCol = i;
      if (/^(definition|definici[oó]n|traducci[oó]n|meaning|espa[ñn]ol|spanish)$/i.test(c)) defCol = i;
    });
  }

  const dataRows = looksLikeHeader ? rows.slice(1) : rows;
  const parsed: ParsedRow[] = [];
  for (const r of dataRows) {
    // Merge continuation columns into definition to survive Excel's comma-split.
    const term = String(r[termCol] ?? '').trim();
    const defParts: string[] = [];
    for (let i = defCol; i < r.length; i++) {
      const v = String(r[i] ?? '').trim();
      if (v.length > 0) defParts.push(v);
    }
    const definition = defParts.join(', ').trim();
    if (term && definition) parsed.push({ term, definition });
  }
  return parsed;
}

/** Parse pasted text into {term, definition}[]. Handles:
 *  - Tab-separated (Google Sheets/Excel copy)
 *  - Markdown pipe tables: | term | definition |
 *  - Bullet/dash: term - definition | term → definition
 *  - CSV-like with first-comma-as-delimiter
 *  Skips separator rows (----, ====) and header rows (term|definition, français|español).
 */
export function parsePastedText(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const rows: ParsedRow[] = [];
  const isSeparator = (l: string) => /^[|\s\-=:_+]+$/.test(l);
  const isHeader = (parts: string[]) => {
    const p = parts.map((s) => s.toLowerCase().trim());
    return p.some((c) =>
      /^(term|word|palabra|français|francais|french|espa[ñn]ol|spanish|definition|definici[oó]n|traducci[oó]n|meaning)$/i.test(c)
    );
  };

  for (const line of lines) {
    if (isSeparator(line)) continue;
    let term = '';
    let definition = '';

    // Markdown pipe table row: | col1 | col2 | ... |
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line.slice(1, -1).split('|').map((s) => s.trim());
      if (cells.length >= 2) {
        if (isHeader(cells)) continue;
        term = cells[0];
        // Strip **bold** markers commonly used in markdown tables
        term = term.replace(/^\*\*(.+)\*\*$/, '$1');
        definition = cells.slice(1).filter(Boolean).join(', ');
      }
    } else if (line.includes('\t')) {
      const parts = line.split('\t').map((s) => s.trim());
      if (isHeader(parts)) continue;
      term = parts[0];
      definition = parts.slice(1).filter(Boolean).join(', ');
    } else {
      // Try term SEP definition, where SEP ∈ { →, ⟶, -, — }
      const arrowMatch = line.match(/^(.+?)\s*(?:→|⟶|—|–|-)\s+(.+)$/);
      if (arrowMatch) {
        const cand = { term: arrowMatch[1].trim(), definition: arrowMatch[2].trim() };
        if (!isHeader([cand.term, cand.definition])) {
          term = cand.term; definition = cand.definition;
        }
      } else {
        // Fall back: first comma
        const commaIdx = line.indexOf(',');
        if (commaIdx > 0) {
          const cand = { term: line.slice(0, commaIdx).trim(), definition: line.slice(commaIdx + 1).trim() };
          if (!isHeader([cand.term, cand.definition])) {
            term = cand.term; definition = cand.definition;
          }
        }
      }
    }

    // Strip surrounding markdown bold/italic on term
    term = term.replace(/^\*+|\*+$/g, '').trim();
    definition = definition.replace(/^\*+|\*+$/g, '').trim();

    if (term && definition) rows.push({ term, definition });
  }
  return rows;
}
