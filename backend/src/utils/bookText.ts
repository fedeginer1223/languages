// eslint-disable-next-line @typescript-eslint/no-var-requires
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

export interface Token { i: number; s: number; e: number; t: string; w: boolean }
export interface RawPage { text: string; chapterTitle?: string }

export interface Line { text: string; x0: number; x1: number; y: number; size: number }
export const H_MARK = '<<H>>';

const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const percentile = (a: number[], q: number) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

/** Group raw pdf.js text items into lines. */
export function itemsToLines(items: { str: string; transform: number[]; width: number }[]): Line[] {
  const its = items
    .filter((i) => i.str !== undefined && i.transform)
    .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], size: Math.hypot(i.transform[0], i.transform[1]) || 10, w: i.width || 0 }))
    .filter((i) => i.str.length > 0);
  its.sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: typeof its[] = [];
  for (const it of its) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(g[0].y - it.y) < 2.5) g.push(it);
    else groups.push([it]);
  }
  const lines: Line[] = [];
  for (const g of groups) {
    g.sort((a, b) => a.x - b.x);
    let text = '';
    let prevEnd: number | null = null;
    for (const it of g) {
      if (prevEnd !== null && it.x - prevEnd > 0.2 * it.size && !/\s$/.test(text) && !/^\s/.test(it.str)) text += ' ';
      text += it.str;
      prevEnd = it.x + it.w;
    }
    text = text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const size = median(g.map((i) => i.size));
    const y = g.reduce((n, i) => n + i.y, 0) / g.length;
    lines.push({ text, x0: g[0].x, x1: Math.max(...g.map((i) => i.x + i.w)), y, size });
  }
  lines.sort((a, b) => b.y - a.y);
  return lines;
}

const PAGE_NUM_RE = /^\s*(\d{1,4}|[ivxlc]{1,6})\s*$/;
const HEAD_WORD_RE = /^(chapitre|chapter|partie|livre)\b/i;
const ROMAN_RE = /^[IVXLC]{1,6}\.?$/;
const PART_RE = /^(première|deuxième|troisième|quatrième|cinquième|sixième)\s+partie$/i;
const TERMINAL_RE = /[.!?…»"”]$/;
const norm = (t: string) => t.toLowerCase().replace(/\d+/g, '').replace(/\s+/g, ' ').trim();

/**
 * Pure: turns per-page lines (with geometry) into paragraphs. Headings are
 * returned prefixed with H_MARK.
 */
export function linesToParagraphs(pages: Line[][], pageWidth: number): string[] {
  // running headers/footers across pages
  const counts = new Map<string, number>();
  for (const pg of pages) {
    const ends = new Set<string>();
    if (pg.length) { ends.add(norm(pg[0].text)); ends.add(norm(pg[pg.length - 1].text)); }
    for (const k of ends) if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const running = new Set<string>();
  if (pages.length >= 4) for (const [k, n] of counts) if (n >= 0.25 * pages.length) running.add(k);

  const paras: string[] = [];
  let cur = '';
  let curIsHeading = false;
  let prevEndsTerminal = true; // state carried across pages
  let first = true;
  const push = () => { if (cur.trim()) paras.push(curIsHeading ? H_MARK + cur.trim() : cur.trim()); cur = ''; curIsHeading = false; };
  const append = (t: string) => {
    if (!cur) { cur = t; return; }
    if (/-$/.test(cur) && /^\p{Ll}/u.test(t)) cur = cur.slice(0, -1) + t;
    else cur += ' ' + t;
  };

  for (const pg of pages) {
    let lines = pg.filter((l) => l.text.trim());
    if (lines.length && PAGE_NUM_RE.test(lines[0].text)) lines = lines.slice(1);
    if (lines.length && PAGE_NUM_RE.test(lines[lines.length - 1].text)) lines = lines.slice(0, -1);
    if (lines.length && running.has(norm(lines[0].text))) lines = lines.slice(1);
    if (lines.length && running.has(norm(lines[lines.length - 1].text))) lines = lines.slice(0, -1);
    if (!lines.length) continue;

    let body = lines.filter((l) => l.text.length >= 20);
    if (!body.length) body = lines;
    const bodySize = median(body.map((l) => l.size)) || 10;
    const leftMargin = percentile(body.map((l) => l.x0), 0.1);
    const gaps: number[] = [];
    for (let k = 1; k < lines.length; k++) gaps.push(Math.abs(lines[k - 1].y - lines[k].y));
    const lineGap = median(gaps);

    lines.forEach((l, k) => {
      const centered = Math.abs((l.x0 + l.x1) / 2 - pageWidth / 2) < 0.12 * pageWidth;
      const heading = l.text.length <= 40 && centered &&
        (l.size >= 1.15 * bodySize || HEAD_WORD_RE.test(l.text) || ROMAN_RE.test(l.text) || PART_RE.test(l.text));
      const indented = l.x0 > leftMargin + 1.2 * bodySize;
      const bigGap = k > 0 && lineGap > 0 && Math.abs(lines[k - 1].y - l.y) > 1.7 * lineGap;
      if (heading) {
        if (!curIsHeading || ROMAN_RE.test(l.text) || PART_RE.test(l.text)) push();
        if (curIsHeading) cur += ' ' + l.text; else { cur = l.text; curIsHeading = true; }
        prevEndsTerminal = true;
      } else {
        let brk: boolean;
        if (curIsHeading) brk = true;
        else if (first) brk = false;
        else if (k === 0) brk = indented || prevEndsTerminal;
        else brk = indented || bigGap;
        if (brk) push();
        append(l.text);
        prevEndsTerminal = TERMINAL_RE.test(l.text);
      }
      first = false;
    });
  }
  push();
  return paras;
}

export async function extractText(buffer: Buffer, mimeOrExt: string): Promise<string> {
  const k = mimeOrExt.toLowerCase();
  const isPdf = k.includes('pdf');
  let text: string;
  if (isPdf) {
    const pages: Line[][] = [];
    let pageWidth = 0;
    const pagerender = async (pageData: any) => {
      const tc = await pageData.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
      if (!pageWidth) {
        const v = pageData.view as number[] | undefined;
        const w = v ? v[2] - v[0] : pageData.getViewport({ scale: 1 }).width;
        if (Number.isFinite(w) && w > 0) pageWidth = w;
      }
      pages.push(itemsToLines(tc.items));
      return '';
    };
    await pdfParse(buffer, { pagerender });
    text = linesToParagraphs(pages, pageWidth || 600).join('\n\n');
  } else {
    text = buffer.toString('utf-8');
  }
  text = text.replace(/\r\n?/g, '\n').replace(/\f/g, '').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (isPdf) {
    const letters = (text.match(/\p{L}/gu) || []).length;
    if (letters < 200) throw new Error('PDF has no text layer (scanned?)');
  }
  return text;
}

const HEADING_RES = [
  /^\s*(chapitre|chapter|partie|livre|book)\b.{0,40}$/i,
  /^\s*[IVXLC]{1,6}\.?\s*$/,
  /^\s*(première|deuxième|troisième|quatrième|cinquième|sixième)\s+partie\s*$/i,
];

function isHeading(p: string): boolean {
  return p.length <= 60 && HEADING_RES.some((r) => r.test(p));
}

function joinLines(par: string): string {
  const lines = par.split('\n').map((l) => l.trim()).filter(Boolean);
  let out = '';
  for (const line of lines) {
    if (!out) { out = line; continue; }
    if (/-$/.test(out) && /^\p{Ll}/u.test(line)) out = out.slice(0, -1) + line;
    else out += ' ' + line;
  }
  return out;
}

const wc = (s: string) => (s.match(/\S+/g) || []).length;

function splitLong(par: string, max: number): string[] {
  const sentences = par.split(/(?<=[.!?…])\s+/);
  const out: string[] = [];
  let cur: string[] = [];
  let n = 0;
  for (const s of sentences) {
    const w = wc(s);
    if (n + w > max && cur.length) { out.push(cur.join(' ')); cur = []; n = 0; }
    cur.push(s); n += w;
  }
  if (cur.length) out.push(cur.join(' '));
  return out;
}

export function splitIntoPages(text: string): RawPage[] {
  const TARGET = 200, MAX = 320;
  const paras = text.split(/\n\s*\n/).map(joinLines).filter(Boolean);
  const marked = (p: string) => p.startsWith(H_MARK);
  const pages: RawPage[] = [];
  let cur: string[] = [];
  let n = 0;
  let title: string | undefined;
  const flush = () => {
    if (cur.length) pages.push({ text: cur.join('\n\n'), chapterTitle: title });
    cur = []; n = 0; title = undefined;
  };
  for (let p of paras) {
    const m = marked(p);
    if (m) p = p.slice(H_MARK.length).trim();
    if (m || isHeading(p)) {
      flush();
      title = p.trim();
      cur.push(p); n += wc(p);
      continue;
    }
    const chunks = wc(p) > MAX ? splitLong(p, TARGET) : [p];
    for (const c of chunks) {
      const w = wc(c);
      if (n >= TARGET || (n > 0 && n + w > MAX)) flush();
      cur.push(c); n += w;
    }
  }
  flush();
  return pages;
}

export function tokenize(text: string): Token[] {
  const re = /[\p{L}\p{M}]+(?:-[\p{L}\p{M}]+)*['’]?|\d+(?:[.,]\d+)*|[^\s]/gu;
  const out: Token[] = [];
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    out.push({ i: i++, s: m.index, e: m.index + m[0].length, t: m[0], w: /\p{L}/u.test(m[0]) });
  }
  return out;
}

export function normalizeForStoplist(t: string): string {
  return t.toLowerCase().replace(/['’]$/, '');
}

export const FRENCH_STOPLIST = new Set<string>(`
le la les l un une des du de d au aux en à y
et ou mais donc or ni car que qu quoi qui quel quelle quels quelles dont où lequel laquelle lesquels lesquelles
si comme quand lorsque puisque quoique quoiqu parce
je j tu il elle on nous vous ils elles me m te t se s moi toi lui eux soi leur leurs
ce c cet cette ces ceci cela ça celui celle ceux celles
mon ma mes ton ta tes son sa ses notre nos votre vos
dans sur sous avec sans pour par chez vers entre contre depuis pendant avant après devant derrière selon malgré parmi sauf
ne n pas point
très plus moins aussi bien mal déjà encore toujours jamais ici là voici voilà oui non
zéro deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize vingt trente quarante cinquante soixante cent mille
monsieur madame mademoiselle messieurs mesdames m. mme mlle
`.split(/\s+/).filter(Boolean));

export const ENGLISH_STOPLIST = new Set<string>(`
a an the
and or but nor so yet if because although though while whereas than that which who whom whose what when where why how whether
i me my mine myself you your yours yourself he him his himself she her hers herself it its itself we us our ours ourselves they them their theirs themselves
this these those there here
of in on at by for with about against between into through during before after above below to from up down out off over under again further then once
not no only too very just also even still already always never often
one two three four five six seven eight nine ten eleven twelve twenty thirty forty fifty hundred thousand
mr mrs ms miss sir
s t d ll re ve m don didn doesn isn wasn aren weren hasn haven hadn won wouldn couldn shouldn
yes oh
`.split(/\s+/).filter(Boolean));

export function stoplistFor(languageCode: string): Set<string> {
  const c = languageCode.toLowerCase();
  if (c === 'fr') return FRENCH_STOPLIST;
  if (c === 'en') return ENGLISH_STOPLIST;
  return new Set();
}
