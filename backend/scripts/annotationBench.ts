import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { splitIntoPages, tokenize, stoplistFor, normalizeForStoplist, Token } from '../src/utils/bookText';
import { annotateTokens, Annotation, AnnotateOptions } from '../src/services/bookAnnotationService';

const SONNET = { in: 2, out: 10, cache: 0.2 };
const HAIKU = { in: 0.1, out: 0.5, cache: 0.01 };

async function main() {
  const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample_fr.txt'), 'utf8');
  const pages = splitIntoPages(text);
  const tokens: Token[] = tokenize(pages[0].text);
  const stop = stoplistFor('fr');
  const content = tokens.filter((t) => t.w && !stop.has(normalizeForStoplist(t.t)));
  console.log(`page 0: ${tokens.filter((t) => t.w).length} words, ${content.length} non-stop`);

  const variants: { name: string; opts: AnnotateOptions; price: typeof SONNET }[] = [
    { name: 'baseline', opts: { thinkingOff: false, compact: false }, price: SONNET },
    { name: 'no-thinking', opts: { thinkingOff: true, compact: false }, price: SONNET },
    { name: 'compact', opts: { thinkingOff: false, compact: true }, price: SONNET },
    { name: 'compact+no-thinking', opts: { thinkingOff: true, compact: true }, price: SONNET },
    { name: 'haiku', opts: { model: 'claude-haiku-5-5', thinkingOff: true, compact: true }, price: HAIKU },
  ];
  const results: Record<string, Annotation[]> = {};
  const rows: string[] = [];
  for (const v of variants) {
    const t0 = Date.now();
    let r;
    try {
      r = await annotateTokens({ languageName: 'Français', languageCode: 'fr', tokens }, v.opts);
    } catch (e: any) {
      console.log(`${v.name} ERROR: ${e?.message ?? e}`);
      if (v.name !== 'haiku') { rows.push(`${v.name} | ERROR`); continue; }
      console.log('  retrying haiku with adaptive thinking');
      try { r = await annotateTokens({ languageName: 'Français', languageCode: 'fr', tokens }, { ...v.opts, thinkingOff: 'adaptive' }); }
      catch (e2: any) { console.log(`haiku adaptive ERROR: ${e2?.message ?? e2}`); rows.push('haiku | ERROR'); continue; }
    }
    const ms = Date.now() - t0;
    results[v.name] = r.items;
    const cov = new Set<number>();
    for (const a of r.items) for (let k = 0; k < a.span; k++) cov.add(a.i + k);
    console.log(`  uncovered(${v.name}): ${content.filter((t) => !cov.has(t.i)).map((t) => t.t).join(' ')}`);
    const pct = (content.filter((t) => cov.has(t.i)).length / content.length) * 100;
    const cost = (r.usage.input * v.price.in + r.usage.output * v.price.out + r.usage.cacheRead * v.price.cache) / 1e6;
    rows.push(`${v.name} | ${r.items.length} | ${pct.toFixed(1)}% | ${r.usage.input} | ${r.usage.output} | cr=${r.usage.cacheRead} | $${cost.toFixed(4)} | ${ms}`);
    console.log(rows[rows.length - 1]);
  }
  console.log('\nvariant | items | coverage | in | out | cacheRead | cost | ms');
  console.log(rows.join('\n'));

  const s = results['compact+no-thinking'], h = results['haiku'];
  if (s && h) {
    const hm = new Map(h.map((a) => [a.i, a]));
    console.log('\nSonnet(compact+no-thinking) vs Haiku, first 25 annotated tokens');
    for (const a of s.slice(0, 25)) {
      const b = hm.get(a.i);
      const flag = !b ? ' [haiku missing]' : (b.lemma !== a.lemma || b.gloss !== a.gloss ? ' [DIFF]' : '');
      console.log(`${tokens[a.i].t} → ${a.lemma}/${a.gloss}/${a.cefr} || ${b ? `${b.lemma}/${b.gloss}/${b.cefr}` : '-'}${flag}`);
    }
    console.log('\nAll glosses differing (whole page):');
    for (const a of s) {
      const b = hm.get(a.i);
      if (b && b.gloss !== a.gloss) console.log(`${tokens[a.i].t}: ${a.gloss} || ${b.gloss}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
