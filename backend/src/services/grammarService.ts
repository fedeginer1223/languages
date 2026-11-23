import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../utils/prisma';
import { calculateSuccessRate, calculateWeightedScore } from '../utils/validation';

const MODEL = 'claude-haiku-4-5-20251001';

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    client = new Anthropic({ apiKey });
  }
  return client;
}

export interface ExtractedGrammarItem {
  title: string;
  body: string;
}

function safeJsonParse<T>(raw: string): T | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]) as T; } catch { return null; }
  }
}

export const grammarService = {
  /**
   * Extract discrete grammar items from a markdown document (Notion export).
   * Uses ### headings as the granularity signal, with body being the markdown
   * block belonging to that heading (bullets, examples, tables). Returns the
   * proposal WITHOUT persisting — caller confirms via saveItems().
   */
  async extractFromMarkdown(languageName: string, markdown: string): Promise<ExtractedGrammarItem[]> {
    const prompt = `Eres un experto en enseñanza de ${languageName}. Recibes un documento markdown con notas de gramática y tu tarea es partirlo en ÍTEMS DE GRAMÁTICA reutilizables para que un estudiante los practique al escribir redacciones.

DOCUMENTO:
"""
${markdown}
"""

INSTRUCCIONES:
- Usa los encabezados nivel 3 (###) como la unidad principal. Cada ### se convierte en un ítem. Si algún ### agrupa cosas muy heterogéneas puedes partirlo en varios; si un ### es trivial (una sola línea sin contenido útil) puedes fusionarlo con el anterior.
- Si hay contenido bajo un ## sin ### debajo (por ejemplo un tema completo sin sub-secciones), trátalo como UN solo ítem.
- Para cada ítem:
  - "title": nombre corto y descriptivo del punto gramatical (ej. "El passé composé", "Uso de 'dont'", "Verbos pronominales"). Máximo 60 caracteres. En español si el título original está en español, o directamente el término francés cuando sea la convención (p. ej. "Le subjonctif présent").
  - "body": el markdown útil de ese ítem — reglas, ejemplos, tablas. Puedes limpiarlo un poco (quitar redundancias, ordenar) pero preservando ejemplos textuales del documento cuando ayuden. Máximo unos 600 caracteres.
- Elimina metadatos del export (líneas vacías repetidas, iconos raros).

Devuelve SOLO un JSON con este formato exacto, sin markdown fences ni texto adicional:
{"items": [{"title": "...", "body": "..."}, ...]}`;

    const res = await getClient().messages.create({
      model: MODEL,
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content[0].type === 'text' ? res.content[0].text : '';
    const parsed = safeJsonParse<{ items: ExtractedGrammarItem[] }>(text);
    if (!parsed || !Array.isArray(parsed.items)) {
      throw new Error('AI did not return usable grammar items');
    }
    return parsed.items
      .map((it) => ({
        title: String(it.title ?? '').trim(),
        body: String(it.body ?? '').trim(),
      }))
      .filter((it) => it.title.length > 0 && it.body.length > 0);
  },

  /**
   * Persist a confirmed list of items into the language. Idempotent by title:
   * existing items keep their dominio stats, body is updated; new titles are
   * created; titles removed from the proposal are LEFT untouched (we never
   * delete items automatically — user can remove manually).
   */
  async saveItems(languageId: string, items: ExtractedGrammarItem[]) {
    for (const it of items) {
      const existing = await prisma.grammarItem.findUnique({
        where: { languageId_title: { languageId, title: it.title } },
      });
      if (existing) {
        await prisma.grammarItem.update({
          where: { id: existing.id },
          data: { body: it.body },
        });
      } else {
        await prisma.grammarItem.create({
          data: { languageId, title: it.title, body: it.body },
        });
      }
    }
    return this.list(languageId);
  },

  list(languageId: string) {
    return prisma.grammarItem.findMany({
      where: { languageId },
      orderBy: [{ weightedScore: 'asc' }, { title: 'asc' }],
    });
  },

  update(id: string, data: { title?: string; body?: string }) {
    return prisma.grammarItem.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title.trim() } : {}),
        ...(data.body !== undefined ? { body: data.body.trim() } : {}),
      },
    });
  },

  delete(id: string) {
    return prisma.grammarItem.delete({ where: { id } });
  },

  /**
   * Pick N items to practice in a new essay. Prioritises never-practiced items
   * (weightedScore=0 with attempts=0) then lowest weightedScore, ties broken
   * randomly.
   */
  async pickForPractice(languageId: string, count: number): Promise<string[]> {
    const all = await prisma.grammarItem.findMany({ where: { languageId } });
    if (all.length === 0) return [];
    const ranked = [...all].sort((a, b) => {
      const aNever = a.attempts === 0 ? 0 : 1;
      const bNever = b.attempts === 0 ? 0 : 1;
      if (aNever !== bNever) return aNever - bNever;
      if (a.weightedScore !== b.weightedScore) return a.weightedScore - b.weightedScore;
      return Math.random() - 0.5;
    });
    return ranked.slice(0, Math.max(1, Math.min(count, all.length))).map((it) => it.id);
  },

  /**
   * Update per-item dominio after an essay is corrected. verdictByItemId maps
   * grammar item id → whether the user used it correctly. "Attempted but wrong"
   * and "not used" both count as fails; only used+correct is a success.
   */
  async recordVerdicts(verdictByItemId: Record<string, boolean>) {
    for (const [id, success] of Object.entries(verdictByItemId)) {
      const item = await prisma.grammarItem.findUnique({ where: { id } });
      if (!item) continue;
      const attempts = item.attempts + 1;
      const correctCount = item.correctCount + (success ? 1 : 0);
      const successRate = calculateSuccessRate(correctCount, attempts);
      const recentResults = (item.recentResults + (success ? '1' : '0')).slice(-30);
      const weightedScore = calculateWeightedScore(recentResults);
      await prisma.grammarItem.update({
        where: { id },
        data: {
          attempts,
          correctCount,
          successRate,
          recentResults,
          weightedScore,
          lastPracticedAt: new Date(),
        },
      });
    }
  },
};
