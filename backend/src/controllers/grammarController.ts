import { Request, Response, NextFunction } from 'express';
import { grammarService } from '../services/grammarService';
import { prisma } from '../utils/prisma';

async function getLanguageName(languageId: string): Promise<string> {
  const lang = await prisma.language.findUnique({ where: { id: languageId }, select: { name: true } });
  return lang?.name ?? 'French';
}

export const grammarController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await grammarService.list(req.params.languageId);
      res.json(items);
    } catch (e) { next(e); }
  },

  async importMarkdown(req: Request, res: Response, next: NextFunction) {
    try {
      const languageId = req.params.languageId;
      const markdown = String(req.body?.markdown ?? '');
      if (!markdown.trim()) return res.status(400).json({ error: 'markdown is required' });
      const languageName = await getLanguageName(languageId);
      const items = await grammarService.extractFromMarkdown(languageName, markdown);
      res.json({ items });
    } catch (e) { next(e); }
  },

  async saveImported(req: Request, res: Response, next: NextFunction) {
    try {
      const languageId = req.params.languageId;
      const raw = Array.isArray(req.body?.items) ? req.body.items : [];
      const items = raw
        .map((it: any) => ({ title: String(it?.title ?? '').trim(), body: String(it?.body ?? '').trim() }))
        .filter((it: { title: string; body: string }) => it.title.length > 0 && it.body.length > 0);
      const saved = await grammarService.saveItems(languageId, items);
      res.json(saved);
    } catch (e) { next(e); }
  },

  async pick(req: Request, res: Response, next: NextFunction) {
    try {
      const languageId = req.params.languageId;
      const requested = Number(req.query.count ?? req.body?.count ?? 3);
      const count = Number.isFinite(requested) && requested > 0 ? Math.min(10, Math.floor(requested)) : 3;
      const ids = await grammarService.pickForPractice(languageId, count);
      const items = await prisma.grammarItem.findMany({ where: { id: { in: ids } } });
      // Preserve the picked order
      const byId = new Map(items.map((i) => [i.id, i]));
      res.json({ items: ids.map((id) => byId.get(id)).filter(Boolean) });
    } catch (e) { next(e); }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await grammarService.update(req.params.id, {
        title: req.body?.title,
        body: req.body?.body,
      });
      res.json(item);
    } catch (e) { next(e); }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await grammarService.delete(req.params.id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  },
};
