import { Router } from 'express';
import multer from 'multer';
import { bookService } from '../services/bookService';
import { ownedParam } from '../middleware/ownership';

export const bookRouter = Router();

bookRouter.param('languageId', ownedParam('language'));
bookRouter.param('bookId', ownedParam('book'));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });

bookRouter.post('/languages/:languageId/books', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    const filename = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    try {
      const book = await bookService.createFromUpload({
        languageId: String(req.params.languageId), buffer: req.file.buffer, filename,
        mimetype: req.file.mimetype, title: req.body?.title, author: req.body?.author,
      });
      return res.status(201).json(book);
    } catch (e: any) {
      if (e?.code === 'P2003') return next(e);
      return res.status(400).json({ error: e?.message ?? 'Could not read file' });
    }
  } catch (err) { next(err); }
});

bookRouter.get('/languages/:languageId/books', async (req, res, next) => {
  try { res.json(await bookService.listForLanguage(String(req.params.languageId))); } catch (err) { next(err); }
});

bookRouter.get('/books/:bookId', async (req, res, next) => {
  try {
    const b = await bookService.getBook(String(req.params.bookId));
    if (!b) return res.status(404).json({ error: 'Book not found' });
    res.json(b);
  } catch (err) { next(err); }
});

bookRouter.get('/books/:bookId/pages/:index', async (req, res, next) => {
  try {
    const index = parseInt(String(req.params.index), 10);
    if (!Number.isInteger(index) || index < 0) return res.status(404).json({ error: 'Page not found' });
    const p = await bookService.getPage(String(req.params.bookId), index);
    if (!p) return res.status(404).json({ error: 'Page not found' });
    res.json(p);
  } catch (err) { next(err); }
});

bookRouter.get('/books/:bookId/bookmarks', async (req, res, next) => {
  try { res.json(await bookService.listBookmarks(String(req.params.bookId))); } catch (err) { next(err); }
});

bookRouter.put('/books/:bookId/bookmarks/:pageIndex', async (req, res, next) => {
  try {
    const n = parseInt(String(req.params.pageIndex), 10);
    if (!Number.isInteger(n) || n < 0) return res.status(400).json({ error: 'Invalid pageIndex' });
    try {
      const r = await bookService.addBookmark(String(req.params.bookId), n);
      if (!r) return res.status(404).json({ error: 'Book not found' });
      return res.json(r);
    } catch (e: any) {
      if (e instanceof RangeError) return res.status(400).json({ error: e.message });
      throw e;
    }
  } catch (err) { next(err); }
});

bookRouter.delete('/books/:bookId/bookmarks/:pageIndex', async (req, res, next) => {
  try {
    const n = parseInt(String(req.params.pageIndex), 10);
    if (!Number.isInteger(n) || n < 0) return res.status(400).json({ error: 'Invalid pageIndex' });
    await bookService.removeBookmark(String(req.params.bookId), n);
    res.status(204).end();
  } catch (err) { next(err); }
});

bookRouter.get('/books/:bookId/highlights', async (req, res, next) => {
  try { res.json(await bookService.listHighlights(String(req.params.bookId))); } catch (err) { next(err); }
});

bookRouter.post('/books/:bookId/highlights', async (req, res, next) => {
  try {
    const pageIndex = Number(req.body?.pageIndex), startToken = Number(req.body?.startToken), endToken = Number(req.body?.endToken);
    try {
      const h = await bookService.createHighlight(String(req.params.bookId), { pageIndex, startToken, endToken });
      if (!h) return res.status(404).json({ error: 'Book not found' });
      return res.status(201).json(h);
    } catch (e: any) {
      if (e instanceof RangeError) return res.status(400).json({ error: e.message });
      throw e;
    }
  } catch (err) { next(err); }
});

bookRouter.delete('/books/:bookId/highlights/:id', async (req, res, next) => {
  try {
    const ok = await bookService.deleteHighlight(String(req.params.bookId), String(req.params.id));
    if (!ok) return res.status(404).json({ error: 'Highlight not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

bookRouter.put('/books/:bookId/progress', async (req, res, next) => {
  try {
    const n = Number(req.body?.lastPageIndex);
    if (!Number.isInteger(n) || n < 0) return res.status(400).json({ error: 'lastPageIndex must be a non-negative integer' });
    await bookService.updateProgress(String(req.params.bookId), n);
    res.json({ lastPageIndex: n });
  } catch (err) { next(err); }
});

bookRouter.post('/books/:bookId/summaries', async (req, res, next) => {
  try {
    const bookId = String(req.params.bookId);
    const from = Number(req.body?.fromIndex), to = Number(req.body?.toIndex);
    const book = await bookService.getBook(bookId);
    if (!book) return res.status(404).json({ error: 'Book not found' });
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > to || to >= book.totalPages || to - from > 30) {
      return res.status(400).json({ error: 'Invalid range (0 <= from <= to < totalPages, max 31 pages)' });
    }
    res.json(await bookService.getOrCreateSummary(bookId, from, to));
  } catch (err) { next(err); }
});

bookRouter.get('/books/:bookId/saved-words', async (req, res, next) => {
  try { res.json(await bookService.listSavedWords(String(req.params.bookId))); } catch (err) { next(err); }
});

bookRouter.post('/books/:bookId/saved-words', async (req, res, next) => {
  try {
    const lemma = String(req.body?.lemma ?? '').trim(), gloss = String(req.body?.gloss ?? '').trim();
    if (!lemma || !gloss) return res.status(400).json({ error: 'lemma and gloss are required' });
    res.status(201).json(await bookService.saveWord(String(req.params.bookId), { lemma, gloss, def: String(req.body?.def ?? '').trim() || undefined }));
  } catch (err) { next(err); }
});

bookRouter.delete('/books/:bookId/saved-words/:lemma', async (req, res, next) => {
  try {
    res.json(await bookService.unsaveWord(String(req.params.bookId), decodeURIComponent(String(req.params.lemma))));
  } catch (err) { next(err); }
});

bookRouter.delete('/books/:bookId', async (req, res, next) => {
  try { await bookService.deleteBook(String(req.params.bookId)); res.status(204).end(); } catch (err) { next(err); }
});

bookRouter.post('/books/:bookId/reprocess', async (req, res, next) => {
  try {
    try {
      const b = await bookService.reprocess(String(req.params.bookId));
      if (!b) return res.status(404).json({ error: 'Book not found' });
      return res.json(b);
    } catch (e: any) {
      if (e instanceof RangeError) return res.status(400).json({ error: e.message });
      return res.status(400).json({ error: e?.message ?? 'Could not reprocess' });
    }
  } catch (err) { next(err); }
});

bookRouter.post('/books/:bookId/pages/:index/reannotate', async (req, res, next) => {
  try {
    const index = parseInt(String(req.params.index), 10);
    if (!Number.isInteger(index) || index < 0) return res.status(404).json({ error: 'Page not found' });
    const p = await bookService.reannotatePage(String(req.params.bookId), index);
    if (!p) return res.status(404).json({ error: 'Page not found' });
    res.json(p);
  } catch (err) { next(err); }
});

bookRouter.post('/books/:bookId/reannotate-read', async (req, res, next) => {
  try {
    const limit = Number(req.body?.limit);
    const after = Number(req.body?.afterIndex ?? NaN);
    res.json(await bookService.reannotateRead(String(req.params.bookId), { limit: Number.isInteger(limit) && limit > 0 ? limit : 40, afterIndex: Number.isInteger(after) ? after : undefined, force: req.body?.force === true }));
  } catch (err) { next(err); }
});
