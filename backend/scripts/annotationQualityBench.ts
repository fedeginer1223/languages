import 'dotenv/config';
import { prisma } from '../src/utils/prisma';
import { annotateTokens, AnnotateOptions, Annotation } from '../src/services/bookAnnotationService';
import { Token } from '../src/utils/bookText';

const BOOK_ID = '2f6a29ca-e635-44e9-99c9-90b328fa8c06';
const PRICE: Record<string, { in: number; out: number; cache: number }> = {
  'claude-sonnet-5-5': { in: 2, out: 10, cache: 0.2 },
  'claude-opus-5-5': { in: 4, out: 20, cache: 0.4 },
};
const TARGETS = ['humeurs', 'cesse', 'plaignait', 'décachetait', 'égards', 'nerfs', 'poitrine', 'odieuse', 'revenait', 'dessous', 'maigres', 'asseoir', 'cloison', 'payaient', 'fallait', 'finir'];

const CONFIGS: { name: string; model: string; opts: AnnotateOptions }[] = [
  { name: 'A-current', model: 'claude-sonnet-5-5', opts: { legacy: true, model: 'claude-sonnet-5-5', thinkingOff: true } },
  { name: 'B-sonnet-new', model: 'claude-sonnet-5-5', opts: { model: 'claude-sonnet-5-5', effort: 'medium' } },
  { name: 'C-opus-new', model: 'claude-opus-5-5', opts: { model: 'claude-opus-5-5', effort: 'medium' } },
];

async function main() {
  // The requested book id may have been re-imported under a new id: fall back to any book containing the passage.
  let page = await prisma.bookPage.findFirst({ where: { bookId: BOOK_ID, text: { contains: 'sans cesse de ses nerfs' } } });
  if (!page) page = await prisma.bookPage.findFirst({ where: { text: { contains: 'sans cesse de ses nerfs' } } });
  if (!page) throw new Error('page not found');
  const pages = await prisma.bookPage.findMany({ where: { bookId: page.bookId, index: page.index - 1 } });
  console.log(`book ${page.bookId} page index ${page.index}`);
  const tokens = page.tokens as any as Token[];
  const prev = pages.find((p) => p.index === page.index - 1);
  const previousContext = prev ? prev.text.split(/\s+/).slice(-80).join(' ') : undefined;

  const rows: string[] = [];
  const res: Record<string, { items: Annotation[]; uncovered: Token[]; passes: any } | null> = {};
  for (const c of CONFIGS) {
    const t0 = Date.now();
    try {
      const r = await annotateTokens({ languageName: 'Français', languageCode: 'fr', tokens, previousContext, text: page.text }, c.opts);
      const ms = Date.now() - t0;
      const p = PRICE[c.model];
      const cost = (r.usage.input * p.in + r.usage.output * p.out + r.usage.cacheRead * p.cache) / 1e6;
      res[c.name] = r;
      rows.push(`${c.name} | ${r.items.length} | ${(r.coverage * 100).toFixed(1)}% | ${r.usage.input} | ${r.usage.output} | $${cost.toFixed(4)} | ${ms} | first=${r.passes.firstPass} +completeness=${r.passes.completeness}`);
    } catch (e: any) {
      console.log(`${c.name} ERROR: ${e?.status ?? ''} ${e?.message ?? e}`);
      res[c.name] = null;
      rows.push(`${c.name} | ERROR`);
    }
  }
  console.log('\nconfig | items | coverage | in | out | cost | ms | passes');
  console.log(rows.join('\n'));

  const find = (items: Annotation[], tok: string): string => {
    const idx = tokens.findIndex((t) => t.t.toLowerCase() === tok);
    if (idx < 0) return '(token absent)';
    const a = items.find((x) => idx >= x.i && idx < x.i + x.span);
    if (!a) return '-- none --';
    const span = tokens.slice(a.i, a.i + a.span).map((t) => t.t).join(' ');
    return `${a.span > 1 ? `[${span}] ` : ''}${a.lemma} = ${a.gloss}`;
  };
  console.log('\ntoken | A | B | C');
  for (const w of TARGETS) {
    const g = CONFIGS.map((c) => (res[c.name] ? find(res[c.name]!.items, w) : 'ERR'));
    const diff = (x: string) => (x !== g[0] ? ' *DIFF*' : '');
    console.log(`${w}\n   A: ${g[0]}\n   B: ${g[1]}${diff(g[1])}\n   C: ${g[2]}${diff(g[2])}`);
  }
  for (const n of ['B-sonnet-new', 'C-opus-new']) {
    console.log(`\nuncovered after completeness (${n}): ${res[n] ? res[n]!.uncovered.map((t) => t.t).join(' ') || '(none)' : 'ERR'}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
