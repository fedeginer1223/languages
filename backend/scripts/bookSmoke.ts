import path from 'path';
import fs from 'fs';
import { prisma } from '../src/utils/prisma';
import { bookService } from '../src/services/bookService';
import { stats } from '../src/services/bookAnnotationService';
import { stoplistFor, normalizeForStoplist, Token } from '../src/utils/bookText';

async function main() {
  const lang = await prisma.language.findFirst({ where: { name: 'Français' } });
  if (!lang) throw new Error('Language Français not found');
  const file = path.join(__dirname, 'fixtures', 'sample_fr.txt');
  const book = await bookService.createFromUpload({
    languageId: lang.id, buffer: fs.readFileSync(file), filename: 'sample_fr.txt', mimetype: 'text/plain',
  });
  console.log(`book ${book.id} totalPages=${book.totalPages} totalWords=${book.totalWords}`);
  const pages = await prisma.bookPage.findMany({ where: { bookId: book.id }, orderBy: { index: 'asc' } });
  for (const p of pages) {
    console.log(`  page ${p.index} / ${p.chapterTitle ?? '-'} / ${(p.tokens as any as Token[]).filter((t) => t.w).length} words`);
  }
  try {
    const page = await bookService.getPage(book.id, 0, { prefetch: 0 });
    if (!page) throw new Error('no page');
    const tokens = page.tokens as Token[];
    const words = tokens.filter((t) => t.w);
    const ann = page.annotations;
    const stop = stoplistFor(lang.code);
    const content = words.filter((t) => !stop.has(normalizeForStoplist(t.t)));
    const covered = new Set<number>();
    for (const a of ann) for (let k = 0; k < a.span; k++) covered.add(a.i + k);
    const cov = content.filter((t) => covered.has(t.i)).length;
    console.log(`word tokens=${words.length} annotations=${ann.length} nonStopWords=${content.length} coverage=${((cov / content.length) * 100).toFixed(1)}%`);
    for (const a of ann.slice(0, 25)) console.log(`  ${tokens[a.i].t}${a.span > 1 ? ` (+${a.span - 1})` : ''} → ${a.lemma} — ${a.gloss} | ${a.def} [${a.cefr}]`);
    console.log(`defsWithoutArticle=${stats.defsWithoutArticle}`);
    const uncovered = content.filter((t) => !covered.has(t.i)).map((t) => t.t);
    console.log('uncovered content tokens:', uncovered.join(' '));
    const b = await bookService.getBook(book.id);
    console.log(`usage in=${b!.inputTokens} out=${b!.outputTokens} cacheRead=${b!.cacheReadTokens} estimatedCostUsd=${b!.estimatedCostUsd.toFixed(5)}`);
    const first = ann[0];
    console.log('saveWord', await bookService.saveWord(book.id, { lemma: first.lemma, gloss: first.gloss, def: first.def }));
    console.log('saved', await bookService.listSavedWords(book.id));
    console.log('unsave', await bookService.unsaveWord(book.id, first.lemma));
  } finally {
    await bookService.deleteBook(book.id);
    await prisma.topic.deleteMany({ where: { languageId: lang.id, name: book.title, words: { none: {} } } });
    console.log('deleted');
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
