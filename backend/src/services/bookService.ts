import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { extractText, splitIntoPages, tokenize, Token } from '../utils/bookText';
import { annotateTokens, summarizeRange, translatePhrase, Annotation, Usage, ANNOTATION_VERSION } from './bookAnnotationService';

const isStale = (p: { annotations: any; annotationVersion?: number | null }) =>
  p.annotations == null || p.annotationVersion !== ANNOTATION_VERSION;

const STALE_WHERE = { annotatedAt: { not: null }, OR: [{ annotationVersion: null }, { annotationVersion: { not: ANNOTATION_VERSION } }] } satisfies Prisma.BookPageWhereInput;

const inflight = new Map<string, Promise<void>>();

function cost(b: { inputTokens: number; outputTokens: number; cacheReadTokens: number }) {
  return (b.inputTokens * 2) / 1e6 + (b.outputTokens * 10) / 1e6 + (b.cacheReadTokens * 0.2) / 1e6;
}
const costFields = (b: any) => ({
  inputTokens: b.inputTokens, outputTokens: b.outputTokens, cacheReadTokens: b.cacheReadTokens,
  estimatedCostUsd: cost(b),
});

async function addUsage(bookId: string, u: Usage) {
  await prisma.book.update({
    where: { id: bookId },
    data: {
      inputTokens: { increment: u.input },
      outputTokens: { increment: u.output },
      cacheReadTokens: { increment: u.cacheRead },
    },
  });
}

async function ensureAnnotated(page: { id: string; bookId: string; index: number; tokens: any; annotations: any; annotationVersion?: number | null }): Promise<void> {
  if (!isStale(page)) return;
  const existing = inflight.get(page.id);
  if (existing) return existing;
  const p = (async () => {
    await prisma.bookPage.update({ where: { id: page.id }, data: { annotating: true } });
    try {
      const book = await prisma.book.findUniqueOrThrow({ where: { id: page.bookId }, include: { language: true } });
      let previousContext: string | undefined;
      if (page.index > 0) {
        const prev = await prisma.bookPage.findUnique({ where: { bookId_index: { bookId: page.bookId, index: page.index - 1 } } });
        if (prev) previousContext = prev.text.split(/\s+/).slice(-60).join(' ');
      }
      const { items, usage } = await annotateTokens({
        languageName: book.language.name, languageCode: book.language.code,
        tokens: page.tokens as Token[], previousContext,
      });
      await prisma.bookPage.update({
        where: { id: page.id },
        data: { annotations: items as any, annotatedAt: new Date(), annotationVersion: ANNOTATION_VERSION, annotating: false },
      });
      await addUsage(page.bookId, usage);
    } catch (err) {
      await prisma.bookPage.update({ where: { id: page.id }, data: { annotating: false } }).catch(() => {});
      throw err;
    }
  })().finally(() => inflight.delete(page.id));
  inflight.set(page.id, p);
  return p;
}

export const bookService = {
  async createFromUpload(a: { languageId: string; buffer: Buffer; filename: string; mimetype: string; title?: string; author?: string }) {
    const isPdf = a.mimetype.includes('pdf') || /\.pdf$/i.test(a.filename);
    const text = await extractText(a.buffer, isPdf ? 'pdf' : 'txt');
    const raw = splitIntoPages(text);
    if (!raw.length) throw new Error('No text found');
    const pages = raw.map((p, index) => ({ ...p, index, tokens: tokenize(p.text) }));
    const totalWords = pages.reduce((n, p) => n + p.tokens.filter((t) => t.w).length, 0);
    const title = (a.title?.trim()) || a.filename.replace(/\.[^.]+$/, '');
    const book = await prisma.book.create({
      data: { languageId: a.languageId, title, author: a.author?.trim() || null, totalPages: pages.length, totalWords,
        sourceMime: isPdf ? 'application/pdf' : (a.mimetype || 'text/plain'), sourceData: a.buffer },
    });
    await prisma.bookPage.createMany({
      data: pages.map((p) => ({ bookId: book.id, index: p.index, chapterTitle: p.chapterTitle ?? null, text: p.text, tokens: p.tokens as any })),
    });
    return book;
  },

  async reprocess(bookId: string) {
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return null;
    if (!book.sourceData) throw new RangeError('Este libro no tiene el archivo original; vuelve a subirlo');
    const isPdf = (book.sourceMime ?? '').includes('pdf');
    const text = await extractText(Buffer.from(book.sourceData), isPdf ? 'pdf' : 'txt');
    const raw = splitIntoPages(text);
    if (!raw.length) throw new Error('No text found');
    const pages = raw.map((p, index) => ({ ...p, index, tokens: tokenize(p.text) }));
    const totalWords = pages.reduce((n, p) => n + p.tokens.filter((t) => t.w).length, 0);
    await prisma.$transaction([
      prisma.bookSavedWord.deleteMany({ where: { bookId } }),
      prisma.bookBookmark.deleteMany({ where: { bookId } }),
      prisma.bookHighlight.deleteMany({ where: { bookId } }),
      prisma.bookSummary.deleteMany({ where: { bookId } }),
      prisma.bookPage.deleteMany({ where: { bookId } }),
      prisma.bookPage.createMany({
        data: pages.map((p) => ({ bookId, index: p.index, chapterTitle: p.chapterTitle ?? null, text: p.text, tokens: p.tokens as any })),
      }),
      prisma.book.update({ where: { id: bookId }, data: { totalPages: pages.length, totalWords, lastPageIndex: 0 } }),
    ]);
    return this.getBook(bookId);
  },

  async listForLanguage(languageId: string) {
    const books = await prisma.book.findMany({ where: { languageId }, orderBy: { createdAt: 'desc' } });
    const counts = await prisma.bookPage.groupBy({
      by: ['bookId'], where: { bookId: { in: books.map((b) => b.id) }, annotatedAt: { not: null } }, _count: { _all: true },
    });
    const m = new Map(counts.map((c) => [c.bookId, c._count._all]));
    const stale = await prisma.bookPage.groupBy({
      by: ['bookId'], where: { bookId: { in: books.map((b) => b.id) }, annotatedAt: { not: null }, OR: [{ annotationVersion: null }, { annotationVersion: { not: ANNOTATION_VERSION } }] }, _count: { _all: true },
    });
    const sm = new Map(stale.map((c) => [c.bookId, c._count._all]));
    return books.map((b) => ({
      id: b.id, title: b.title, author: b.author, totalPages: b.totalPages, totalWords: b.totalWords,
      lastPageIndex: b.lastPageIndex, annotatedPages: m.get(b.id) ?? 0, stalePages: sm.get(b.id) ?? 0, createdAt: b.createdAt, ...costFields(b),
    }));
  },

  async getBook(bookId: string) {
    const b = await prisma.book.findUnique({ where: { id: bookId } });
    if (!b) return null;
    const ch = await prisma.bookPage.findMany({
      where: { bookId, chapterTitle: { not: null } }, orderBy: { index: 'asc' }, select: { index: true, chapterTitle: true },
    });
    const annotatedPages = await prisma.bookPage.count({ where: { bookId, annotatedAt: { not: null } } });
    const stalePages = await prisma.bookPage.count({ where: { bookId, ...STALE_WHERE } });
    const bms = await prisma.bookBookmark.findMany({ where: { bookId }, orderBy: { pageIndex: 'asc' }, select: { pageIndex: true } });
    return {
      id: b.id, languageId: b.languageId, title: b.title, author: b.author, status: b.status, error: b.error,
      totalPages: b.totalPages, totalWords: b.totalWords, lastPageIndex: b.lastPageIndex, annotatedPages, stalePages,
      createdAt: b.createdAt, chapters: ch.map((c) => ({ index: c.index, title: c.chapterTitle! })), bookmarks: bms.map((x) => x.pageIndex), ...costFields(b),
    };
  },

  async getPage(bookId: string, index: number, opts: { prefetch?: number } = {}) {
    const prefetch = opts.prefetch ?? 2;
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return null;
    let page = await prisma.bookPage.findUnique({ where: { bookId_index: { bookId, index } } });
    if (!page) return null;
    let staleFallback = false;
    if (isStale(page)) {
      const old = page;
      try {
        await ensureAnnotated(page);
        page = await prisma.bookPage.findUniqueOrThrow({ where: { id: page.id } });
      } catch (e: any) {
        if (old.annotations == null) throw e;
        console.error('[books] re-annotation failed, serving old annotations', e?.message ?? e);
        page = old;
        staleFallback = true;
      }
    }
    for (let k = 1; k <= prefetch; k++) {
      prisma.bookPage.findUnique({ where: { bookId_index: { bookId, index: index + k } } })
        .then((p) => (p && isStale(p) ? ensureAnnotated(p) : undefined))
        .catch((e) => console.error('[books] prefetch failed', e?.message ?? e));
    }
    const saved = await prisma.bookSavedWord.findMany({ where: { bookId }, select: { lemma: true } });
    const highlights = await prisma.bookHighlight.findMany({
      where: { bookId, pageIndex: index }, orderBy: { startToken: 'asc' }, select: { id: true, startToken: true, endToken: true, translation: true },
    });
    return {
      highlights,
      index: page.index, chapterTitle: page.chapterTitle, text: page.text, tokens: page.tokens,
      annotations: page.annotations as unknown as Annotation[], totalPages: book.totalPages,
      savedLemmas: saved.map((s) => s.lemma),
      ...(staleFallback ? { stale: true } : {}),
    };
  },

  async reannotatePage(bookId: string, index: number) {
    const page = await prisma.bookPage.findUnique({ where: { bookId_index: { bookId, index } } });
    if (!page) return null;
    await ensureAnnotated({ ...page, annotationVersion: null });
    return this.getPage(bookId, index, { prefetch: 0 });
  },

  async reannotateRead(bookId: string, opts: { limit?: number; afterIndex?: number; force?: boolean } = {}) {
    const afterIndex = opts.afterIndex ?? -1;
    const limit = Math.max(1, Math.min(opts.limit ?? 40, 200));
    const pages = await prisma.bookPage.findMany({
      where: { bookId, index: { gt: afterIndex }, ...(opts.force ? { annotatedAt: { not: null } } : STALE_WHERE) }, orderBy: { index: 'asc' }, select: { index: true },
    });
    const batch = pages.slice(0, limit);
    let done = 0;
    const failed: { index: number; error: string }[] = [];
    for (const p of batch) {
      try { await this.reannotatePage(bookId, p.index); done++; }
      catch (e: any) { failed.push({ index: p.index, error: e?.message ?? String(e) }); }
    }
    // Failed pages stay annotated=null (not counted), successful ones are re-annotated; remaining = untouched pages.
    const staleRemaining = await prisma.bookPage.count({ where: { bookId, ...STALE_WHERE } });
    return { done, failed, remaining: Math.max(0, pages.length - batch.length), staleRemaining, nextAfterIndex: batch.length ? batch[batch.length - 1].index : afterIndex };
  },

  async listBookmarks(bookId: string) {
    const bms = await prisma.bookBookmark.findMany({ where: { bookId }, orderBy: { pageIndex: 'asc' } });
    if (!bms.length) return [];
    const pages = await prisma.bookPage.findMany({
      where: { bookId, index: { in: bms.map((b) => b.pageIndex) } }, select: { index: true, chapterTitle: true, text: true },
    });
    const m = new Map(pages.map((p) => [p.index, p]));
    return bms.map((b) => {
      const p = m.get(b.pageIndex);
      let text = p?.text ?? '';
      if (p?.chapterTitle) {
        const t = text.trimStart();
        if (t.startsWith(p.chapterTitle)) text = t.slice(p.chapterTitle.length);
      }
      const snippet = text.split(/\s+/).filter(Boolean).slice(0, 12).join(' ');
      return { pageIndex: b.pageIndex, createdAt: b.createdAt, snippet };
    });
  },

  async addBookmark(bookId: string, pageIndex: number) {
    const book = await prisma.book.findUnique({ where: { id: bookId }, select: { totalPages: true } });
    if (!book) return null;
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= book.totalPages) throw new RangeError('pageIndex out of range');
    const b = await prisma.bookBookmark.upsert({
      where: { bookId_pageIndex: { bookId, pageIndex } }, create: { bookId, pageIndex }, update: {},
    });
    return { pageIndex: b.pageIndex, createdAt: b.createdAt };
  },

  async removeBookmark(bookId: string, pageIndex: number) {
    await prisma.bookBookmark.deleteMany({ where: { bookId, pageIndex } });
  },

  async updateProgress(bookId: string, lastPageIndex: number) {
    return prisma.book.update({ where: { id: bookId }, data: { lastPageIndex } });
  },

  async getOrCreateSummary(bookId: string, fromIndex: number, toIndex: number) {
    const ex = await prisma.bookSummary.findUnique({ where: { bookId_fromIndex_toIndex: { bookId, fromIndex, toIndex } } });
    if (ex && ex.annotationVersion === ANNOTATION_VERSION) return { fromIndex, toIndex, text: ex.text, tokens: ex.tokens, annotations: ex.annotations };
    if (ex) await prisma.bookSummary.deleteMany({ where: { id: ex.id } });
    const book = await prisma.book.findUniqueOrThrow({ where: { id: bookId }, include: { language: true } });
    const pages = await prisma.bookPage.findMany({
      where: { bookId, index: { gte: fromIndex, lte: toIndex } }, orderBy: { index: 'asc' }, select: { text: true },
    });
    const { summary, usage } = await summarizeRange({ languageName: book.language.name, text: pages.map((p) => p.text).join('\n\n') });
    const tokens = tokenize(summary);
    const ann = await annotateTokens({ languageName: book.language.name, languageCode: book.language.code, tokens });
    await prisma.bookSummary.upsert({
      where: { bookId_fromIndex_toIndex: { bookId, fromIndex, toIndex } },
      create: { bookId, fromIndex, toIndex, text: summary, tokens: tokens as any, annotations: ann.items as any, annotationVersion: ANNOTATION_VERSION },
      update: {},
    });
    await addUsage(bookId, { input: usage.input + ann.usage.input, output: usage.output + ann.usage.output, cacheRead: usage.cacheRead + ann.usage.cacheRead });
    return { fromIndex, toIndex, text: summary, tokens, annotations: ann.items };
  },

  async listHighlights(bookId: string) {
    return prisma.bookHighlight.findMany({ where: { bookId }, orderBy: [{ pageIndex: 'asc' }, { startToken: 'asc' }] });
  },

  async createHighlight(bookId: string, a: { pageIndex: number; startToken: number; endToken: number }) {
    const book = await prisma.book.findUnique({ where: { id: bookId }, include: { language: true } });
    if (!book) return null;
    const page = await prisma.bookPage.findUnique({ where: { bookId_index: { bookId, index: a.pageIndex } } });
    if (!page) throw new RangeError('Page not found');
    const tokens = page.tokens as unknown as Token[];
    const { startToken: s, endToken: e } = a;
    if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || s > e || e >= tokens.length) throw new RangeError('Invalid token range');
    if (e - s + 1 > 120) throw new RangeError('Selection too long (max 120 tokens)');
    const text = page.text.slice(tokens[s].s, tokens[e].e);
    // Context: the paragraph containing the phrase.
    let context: string | undefined;
    let off = 0;
    for (const para of page.text.split(/\n\s*\n/)) {
      const start = page.text.indexOf(para, off);
      off = start + para.length;
      if (tokens[s].s >= start && tokens[s].s <= off) { context = para.length > text.length + 20 ? para.slice(0, 1500) : undefined; break; }
    }
    const { translation, usage } = await translatePhrase({ languageName: book.language.name, text, context });
    await addUsage(bookId, usage);
    return prisma.bookHighlight.create({ data: { bookId, pageIndex: a.pageIndex, startToken: s, endToken: e, text, translation } });
  },

  async deleteHighlight(bookId: string, id: string) {
    const r = await prisma.bookHighlight.deleteMany({ where: { id, bookId } });
    return r.count > 0;
  },

  async saveWord(bookId: string, a: { lemma: string; gloss: string; def?: string }) {
    const book = await prisma.book.findUniqueOrThrow({ where: { id: bookId } });
    let topic = await prisma.topic.findFirst({ where: { languageId: book.languageId, name: book.title } });
    if (!topic) topic = await prisma.topic.create({ data: { languageId: book.languageId, name: book.title } });
    let word = await prisma.word.findFirst({ where: { topicId: topic.id, term: { equals: a.lemma, mode: 'insensitive' } } });
    if (!word) word = await prisma.word.create({ data: { term: a.lemma, definition: a.def?.trim() || a.gloss, topicId: topic.id, source: 'vocabulary' } });
    await prisma.bookSavedWord.upsert({
      where: { bookId_lemma: { bookId, lemma: a.lemma } },
      create: { bookId, wordId: word.id, lemma: a.lemma },
      update: { wordId: word.id },
    });
    return { wordId: word.id, lemma: a.lemma, gloss: word.definition };
  },

  async unsaveWord(bookId: string, lemma: string) {
    const s = await prisma.bookSavedWord.findUnique({ where: { bookId_lemma: { bookId, lemma } }, include: { word: true } });
    if (!s) return { removed: false };
    await prisma.bookSavedWord.delete({ where: { id: s.id } });
    if (s.word.attempts === 0) await prisma.word.delete({ where: { id: s.wordId } }).catch(() => {});
    return { removed: true };
  },

  async listSavedWords(bookId: string) {
    const rows = await prisma.bookSavedWord.findMany({ where: { bookId }, include: { word: true }, orderBy: { createdAt: 'desc' } });
    return rows.map((r) => ({
      lemma: r.lemma, term: r.word.term, definition: r.word.definition, wordId: r.wordId,
      srsLevel: r.word.srsLevel, attempts: r.word.attempts, correctCount: r.word.correctCount, createdAt: r.createdAt,
    }));
  },

  async deleteBook(bookId: string) {
    await prisma.book.delete({ where: { id: bookId } });
  },
};
