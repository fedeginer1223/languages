import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { Token, stoplistFor, normalizeForStoplist } from '../utils/bookText';

const MODEL = 'claude-sonnet-5-5';

// Bump whenever the annotation prompt/rules change; pages with a different version are re-annotated when opened.
export const ANNOTATION_VERSION = 5;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    client = new Anthropic({ apiKey });
  }
  return client;
}

export type Cefr = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export interface Annotation { i: number; span: number; lemma: string; gloss: string; def: string; cefr: Cefr }
export const stats = { defsWithoutArticle: 0 };
export interface Usage { input: number; output: number; cacheRead: number }

const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          i: { type: 'integer' },
          span: { type: 'integer' },
          lemma: { type: 'string' },
          gloss: { type: 'string' },
          def: { type: 'string' },
          cefr: { type: 'string', enum: [...CEFR] },
        },
        required: ['i', 'span', 'lemma', 'gloss', 'def', 'cefr'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

const ResponseZ = z.object({
  items: z.array(z.object({
    i: z.number().int(),
    span: z.number().int(),
    lemma: z.string(),
    gloss: z.string(),
    def: z.string(),
    cefr: z.enum(CEFR),
  })),
});

const OUT_COMPACT = `Output format: plain text, one annotation per line, fields separated by "|", no header, no code fences, no commentary, no blank lines.
Line format: i|span|lemma|gloss|def|cefr   with span OMITTED when it is 1 (so a line has 5 fields, or 6 when span > 1).
- gloss = literal Spanish of the surface span as written (no article added); def = dictionary translation of the lemma. For NOUNS def ALWAYS starts with the Spanish indefinite article un/una matching the Spanish noun's gender (heures -> una hora, never bare "hora").
- Plural noun (token "lieues"): 17|une lieue|leguas|una legua|B1
- Plural noun (token "volets"): 5|un volet|postigos|un postigo|B2
- Noun, def with article (token "horloge"): 8|une horloge|reloj|un reloj de pared|B1
- Conjugated verb (token "marchait"): 4|marcher|caminaba|caminar|A2
- Multiword (span 2, "sans cesse"): 9|2|sans cesse|sin cesar|sin cesar|B2
- Pronominal (span 2, "se plaignait"): 22|2|se plaindre|se quejaba|quejarse|B1
- Literary tense (token "furent"): 30|être|fueron [passé simple]|ser|A2
lemma = dictionary form of the lemma rule. cefr is one of A1 A2 B1 B2 C1 C2. Never use "|" inside a field.
Forms of être and avoir (était, avait, fut, furent, eut, soit...) are NOT function words here: always gloss them. Also gloss rien, chose, jusqu', quelque(s), tout, même, autre.
Completeness check: every token not excluded by (a)/(b) needs a line, including adjectives (grands, vieille), quantifiers (quelques, moins), conjugated verbs with hyphenated pronouns (dit-il, répondit-elle), modal/auxiliary-looking verbs used as full verbs (devrais), and elided forms (jusqu'). Do not skip a word because it seems obvious.`;

export interface AnnotateOptions {
  model?: string;
  thinkingOff?: boolean | 'adaptive';
  compact?: boolean;
  /** Reproduce the old behaviour: token list only (no prose), old rules, effort low, no completeness pass. */
  legacy?: boolean;
  effort?: 'low' | 'medium' | 'high';
  /** Skip the second "missing tokens" call. */
  noCompleteness?: boolean;
  /** Use server-side refusal fallback (beta). Default true for Opus/Sonnet 5.5. */
  fallback?: boolean;
}
const DEFAULT_OPTS = {
  model: process.env.BOOK_ANNOTATION_MODEL || MODEL,
  thinkingOff: false as boolean | 'adaptive',
  compact: true,
  legacy: false,
  effort: (process.env.BOOK_ANNOTATION_EFFORT || 'medium') as 'low' | 'medium' | 'high',
  noCompleteness: false,
  fallback: true,
};

function parseCompact(raw: string): { i: number; span: number; lemma: string; gloss: string; def: string; cefr: Cefr }[] {
  const out: { i: number; span: number; lemma: string; gloss: string; def: string; cefr: Cefr }[] = [];
  for (const line of raw.split('\n')) {
    const f = line.trim().split('|').map((x) => x.trim());
    if (f.length < 4 || f.length > 6) continue;
    const i = Number(f[0].replace(/^\[|\]$/g, ''));
    const cefr = f[f.length - 1];
    let span = 1, lemma: string, gloss: string, def: string;
    if (f.length === 6) { span = Number(f[1]); [lemma, gloss, def] = f.slice(2, 5); }
    else if (f.length === 5) {
      // new shape without span (i|lemma|gloss|def|cefr) or old shape with span (i|span|lemma|gloss|cefr)
      if (/^\d+$/.test(f[1])) { span = Number(f[1]); [lemma, gloss] = f.slice(2, 4); def = gloss; }
      else { [lemma, gloss, def] = f.slice(1, 4); }
    } else { [lemma, gloss] = f.slice(1, 3); def = gloss; }
    if (!Number.isInteger(i) || !Number.isInteger(span) || span < 1) continue;
    if (!(CEFR as readonly string[]).includes(cefr)) continue;
    out.push({ i, span, lemma, gloss, def: def || gloss, cefr: cefr as Cefr });
  }
  return out;
}

function systemPrompt(languageName: string, languageCode: string, compact: boolean, legacy = false): string {
  const stop = [...stoplistFor(languageCode)].sort().join(' ');
  const lemmaRule = languageCode.toLowerCase() === 'fr'
    ? 'nouns with the indefinite article ("un cotret", "une maison"); verbs in the infinitive, including reflexive "se"/"s\'" ("s\'arrêter"); adjectives in masculine singular without article; adverbs and expressions in base form'
    : 'bare dictionary form (nouns singular without article, verbs in the infinitive without "to", adjectives in base form; expressions in base form)';
  if (legacy) return legacyPrompt(languageName, stop, lemmaRule, compact);
  return `You are a graded-reader glosser. The text is in ${languageName}; the learner's native language is Spanish.

You receive the full text of one page, followed by its tokens one per line as "[i] token" (i = token index). READ THE WHOLE PASSAGE FIRST, then annotate the tokens. Produce one item for EVERY listed token, except:
(a) ONLY the function words in the stoplist below (articles, prepositions, pronouns, conjunctions, negation, a few pure adverbs, number words, titles like monsieur/madame). Every other token gets an item, including ALL verb forms (forms of être and avoir / be and have are NOT function words here, always gloss them) and quantifiers/determiners (quelque, chaque, plusieurs, tout, même, autre, tel, certain...),
(b) proper nouns (people, places, brands) and tokens already inside the span of a multiword item.
Never skip a content word because it is easy: give it "A1" or "A2". Every content token must be covered by an item or by the span of one.

Rules:
- MEANING IN CONTEXT: choose the sense that fits THIS sentence and the period/register of the text, not the most frequent modern sense. For 19th-century literary French: "humeurs" = bodily humours / ailments (los humores, las dolencias), "commerce" = dealings, "intelligence" = understanding, "fortune" = wealth or fate, "égards" = consideration, "nerfs" = nerves (nervios).
- FIXED EXPRESSIONS: idioms, phrasal units and multiword adverbials/prepositions are ONE item on their first token, with span = number of tokens covered (count punctuation tokens in between). Examples: "sans cesse", "tout à coup", "à n'en plus finir", "de dessous", "faire asseoir", "au bout de", "peu à peu", "en train de", "n'importe quoi", "avoir beau". Gloss the unit as a whole ("sin cesar", "de repente", "interminables"). Do not also emit items for the other tokens inside a span.
- PRONOMINAL VERBS: when the reflexive pronoun is present, the item starts on the pronoun: "se plaignait" -> span 2, lemma "se plaindre", gloss "se quejaba".
- lemma = dictionary form: ${lemmaRule}.
- gloss = LITERAL Spanish of the surface span exactly as it appears: same number (lieues -> leguas), gender, person and tense (marchait -> caminaba). Include an article ONLY if the span itself includes it (des lieues -> unas leguas; bare lieues -> leguas); never add articles. Correct for this context. For LITERARY tenses (passé simple, passé antérieur, imparfait/plus-que-parfait du subjonctif) append the tense in brackets: furent -> fueron [passé simple], eût -> hubiera [subj. imparfait]. At most 4 words per gloss plus the optional bracket. Always Spanish, never ${languageName}.
- def = dictionary translation of the lemma (context-appropriate sense). MANDATORY for NOUNS: def MUST begin with the Spanish indefinite article un/una (singular, even if the token is plural) matching the Spanish noun's gender: une lieue -> una legua, un volet -> un postigo, une horloge -> un reloj de pared, des heures -> una hora. A noun def without article is WRONG. Verbs: infinitive (marcher -> caminar). Adjectives: masculine singular, no article (grand -> grande). Expressions: base form (sin cesar). At most 4 words (article included).
- cefr = CEFR level (A1..C2) at which a learner typically knows this word in this meaning.
- Use the original token index i. ${compact ? OUT_COMPACT : 'Output only the JSON.'}

Stoplist (lowercase, non-exhaustive):
${stop}`;
}

function legacyPrompt(languageName: string, stop: string, lemmaRule: string, compact: boolean): string {
  return `You are a graded-reader glosser. The text is in ${languageName}; the learner's native language is Spanish.

You receive tokens from one page, one per line as "[i] token" (i = token index). Produce one item for EVERY listed token, except:
(a) ONLY the function words in the stoplist below (articles, prepositions, pronouns, conjunctions, negation, a few pure adverbs, number words, titles like monsieur/madame). Every other token gets an item, including ALL verb forms (forms of être and avoir / be and have are NOT function words here, always gloss them) and quantifiers/determiners (quelque, chaque, plusieurs, tout, même, autre, tel, certain...),
(b) proper nouns (people, places, brands).
Never skip a content word because it is easy: give it "A1".

Rules:
- Multiword expressions (idioms, phrasal units such as "à l'envers", "tout de suite", "coup de main") become ONE item on the first token, with span = number of consecutive tokens covered (count non-word tokens in between, e.g. apostrophes are part of tokens but punctuation counts). Single words have span 1. Do not also emit items for the other tokens inside a span.
- lemma = dictionary form: ${lemmaRule}.
- gloss = Spanish translation of the surface form AS IT APPEARS, inflected to match it (person, tense, number, gender), correct FOR THIS CONTEXT: venait -> venía, réveillés -> despertados, furent -> fueron, une lucarne -> una claraboya. Nouns keep their article ("un hacha"). For LITERARY tenses (passé simple, passé antérieur, imparfait/plus-que-parfait du subjonctif) append the tense in brackets: furent -> fueron [passé simple], eût -> hubiera [subj. imparfait]. Keep glosses to at most 4 words plus the optional bracket. Always Spanish, never ${languageName}.
- cefr = CEFR level (A1..C2) at which a learner typically knows this word in this meaning.
- Use the original token index i. ${compact ? OUT_COMPACT : 'Output only the JSON.'}

Stoplist (lowercase, non-exhaustive):
${stop}`;
}


function tally(u: Anthropic.Messages.Usage): Usage {
  return { input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens ?? 0 };
}

function reconstructText(tokens: Token[]): string {
  let out = '';
  for (let k = 0; k < tokens.length; k++) {
    if (k > 0) out += tokens[k].s > tokens[k - 1].e ? ' ' : '';
    out += tokens[k].t;
  }
  return out;
}

const OPENERS = /^[«"“‘(\[—–-]$/;
const SENT_END = /^[.!?…]+$/;

/** Heuristic: capitalised and not sentence-initial. */
function isProperNoun(tokens: Token[], k: number): boolean {
  const t = tokens[k];
  if (!/^\p{Lu}/u.test(t.t)) return false;
  let j = k - 1;
  while (j >= 0 && OPENERS.test(tokens[j].t)) j--;
  if (j < 0) return false;
  return !SENT_END.test(tokens[j].t);
}

const ARTICLE_LEMMA = /^(un|une|a|an)\s/i;
const ARTICLE_DEF = /^(un|una|unos|unas)\s/i;

function validate(parsed: { i: number; span: number; lemma: string; gloss: string; def: string; cefr: Cefr }[], tokens: Token[]): Annotation[] {
  const wordIdx = new Set(tokens.filter((t) => t.w).map((t) => t.i));
  const seen = new Set<number>();
  const items: Annotation[] = [];
  for (const it of parsed) {
    if (!wordIdx.has(it.i) || seen.has(it.i)) continue;
    if (!it.lemma.trim() || !it.gloss.trim()) continue;
    seen.add(it.i);
    const span = Math.max(1, Math.min(it.span, 6, tokens.length - it.i));
    let crossesPunct = false;
    for (let k = it.i; k < it.i + span; k++) if (/^[.!?;:]$/.test(tokens[k]?.t ?? '')) { crossesPunct = true; break; }
    if (crossesPunct) continue;
    const lemma = it.lemma.trim(), def = it.def?.trim() || it.gloss.trim();
    // Nudge only: a noun lemma with an article but a def without one is counted (gender is not guessed).
    if (ARTICLE_LEMMA.test(lemma) && !ARTICLE_DEF.test(def)) stats.defsWithoutArticle++;
    items.push({ i: it.i, span, lemma, gloss: it.gloss.trim(), def, cefr: it.cefr });
  }
  return items;
}

/** Word tokens that should carry an item (not stoplisted, not proper nouns). */
export function eligibleTokens(tokens: Token[], languageCode: string): Token[] {
  const stop = stoplistFor(languageCode);
  return tokens.filter((t) => t.w && !stop.has(normalizeForStoplist(t.t)) && !isProperNoun(tokens, t.i));
}

function coveredSet(items: Annotation[]): Set<number> {
  const c = new Set<number>();
  for (const a of items) for (let k = 0; k < a.span; k++) c.add(a.i + k);
  return c;
}

async function callModel(o: typeof DEFAULT_OPTS, system: string, user: string): Promise<{ items: ReturnType<typeof parseCompact>; usage: Usage }> {
  const params: any = {
    model: o.model,
    max_tokens: 8000,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
  };
  const effort = o.legacy ? 'low' : o.effort;
  params.output_config = o.compact ? { effort } : { effort, format: { type: 'json_schema', schema: SCHEMA } };
  if (o.legacy) {
    if (o.thinkingOff === 'adaptive') params.thinking = { type: 'adaptive' };
    else if (o.thinkingOff) params.thinking = { type: 'between_tools' };
  } else if (!/opus/.test(o.model)) {
    // Opus: thinking cannot be disabled, omit the param and rely on effort.
    params.thinking = o.thinkingOff === true ? { type: 'between_tools' } : { type: 'adaptive' };
  }
  const useFallback = o.fallback && !o.legacy && /claude-(opus|sonnet)-5-5/.test(o.model);
  let response: Anthropic.Messages.Message;
  if (useFallback) {
    try {
      response = (await getClient().beta.messages.create({ ...params, fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'] })) as any;
    } catch (e: any) {
      if (e?.status === 400 || e?.status === 404) {
        console.warn('[annotate] server-side fallback rejected, retrying without:', e?.message);
        response = (await getClient().messages.create(params)) as Anthropic.Messages.Message;
      } else throw e;
    }
  } else {
    response = (await getClient().messages.create(params)) as Anthropic.Messages.Message;
  }
  if (response.stop_reason === 'refusal') {
    throw new Error('annotation refused: ' + ((response as any).stop_details?.explanation ?? ''));
  }
  const raw = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const items = (o.compact ? parseCompact(raw) : ResponseZ.parse(JSON.parse(raw)).items) as ReturnType<typeof parseCompact>;
  return { items, usage: tally(response.usage) };
}

export async function annotateTokens(input: {
  languageName: string; languageCode: string; tokens: Token[]; previousContext?: string; text?: string;
}, options: AnnotateOptions = {}): Promise<{ items: Annotation[]; usage: Usage; coverage: number; uncovered: Token[]; passes: { firstPass: number; completeness: number } }> {
  const { tokens } = input;
  const o = { ...DEFAULT_OPTS, ...options };
  const mkLines = (ts: Token[]) => ts.filter((t) => t.w).map((t) => `[${t.i}] ${t.t}`).join('\n');
  const system = systemPrompt(input.languageName, input.languageCode, o.compact, o.legacy);

  if (o.legacy) {
    const user = (input.previousContext ? `Contexte précédent: ${input.previousContext}\n\n` : '') + `Tokens:\n${mkLines(tokens)}`;
    const r = await callModel(o, system, user);
    const items = validate(r.items, tokens).sort((a, b) => a.i - b.i);
    const elig = eligibleTokens(tokens, input.languageCode);
    const cov = coveredSet(items);
    const uncovered = elig.filter((t) => !cov.has(t.i));
    return { items, usage: r.usage, coverage: elig.length ? 1 - uncovered.length / elig.length : 1, uncovered, passes: { firstPass: items.length, completeness: 0 } };
  }

  const pageText = input.text ?? reconstructText(tokens);
  const ctxWords = (input.previousContext ?? '').split(/\s+/).filter(Boolean);
  const ctx = ctxWords.slice(-80).join(' ');
  const prose = (ctx ? `Contexte précédent:\n${ctx}\n\n` : '') + `Texte de la page (lis-le en entier avant d'annoter):\n${pageText}\n\n`;
  const first = await callModel(o, system, prose + `Tokens à annoter:\n${mkLines(tokens)}`);
  let items = validate(first.items, tokens);
  let usage = first.usage;
  const firstCount = items.length;

  const elig = eligibleTokens(tokens, input.languageCode);
  let cov = coveredSet(items);
  let uncovered = elig.filter((t) => !cov.has(t.i));
  let added = 0;
  if (uncovered.length > 0 && !o.noCompleteness) {
    try {
      const second = await callModel(o, system, prose + `Il manque des annotations pour ces tokens — annote UNIQUEMENT ceux-ci:\n${mkLines(uncovered)}`);
      const have = new Set(items.map((a) => a.i));
      const wanted = new Set(uncovered.map((t) => t.i));
      for (const it of validate(second.items, tokens)) {
        // first response wins on conflicts: skip anything overlapping an existing span
        let clash = false;
        for (let k = it.i; k < it.i + it.span; k++) if (cov.has(k) || (k !== it.i && have.has(k))) clash = true;
        if (clash || !wanted.has(it.i)) continue;
        items.push(it);
        have.add(it.i);
        added++;
      }
      usage = { input: usage.input + second.usage.input, output: usage.output + second.usage.output, cacheRead: usage.cacheRead + second.usage.cacheRead };
      cov = coveredSet(items);
      uncovered = elig.filter((t) => !cov.has(t.i));
    } catch (e: any) {
      console.warn('[annotate] completeness pass failed:', e?.message ?? e);
    }
  }
  items.sort((a, b) => a.i - b.i);
  return { items, usage, coverage: elig.length ? 1 - uncovered.length / elig.length : 1, uncovered, passes: { firstPass: firstCount, completeness: added } };
}

export async function translatePhrase(input: { languageName: string; text: string; context?: string }, options: AnnotateOptions = {}): Promise<{ translation: string; usage: Usage }> {
  const o = { ...DEFAULT_OPTS, ...options };
  const params: any = {
    model: o.model,
    max_tokens: 2000,
    system: `Translate this ${input.languageName} passage into natural Spanish, faithful to meaning and register; output only the translation.`,
    messages: [{ role: 'user', content: (input.context ? `Context (for reference only, do not translate it):\n${input.context}\n\nPassage to translate:\n` : '') + input.text }],
    output_config: { effort: o.effort },
  };
  if (!/opus/.test(o.model)) params.thinking = { type: 'adaptive' };
  const response = (await getClient().messages.create(params)) as Anthropic.Messages.Message;
  if (response.stop_reason === 'refusal') throw new Error('translation refused: ' + ((response as any).stop_details?.explanation ?? ''));
  const translation = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  return { translation, usage: tally(response.usage) };
}

export async function summarizeRange(input: { languageName: string; text: string }): Promise<{ summary: string; usage: Usage }> {
  const sumParams: any = {
    model: MODEL,
    max_tokens: 2000,
    system: `You summarize passages of books for language learners. Write in ${input.languageName}, in simple clear prose, present tense, 120 to 180 words. Say what happens in the passage only: no spoilers beyond it, no preamble, no title, no commentary.`,
    messages: [{ role: 'user', content: input.text }],
    output_config: { effort: 'low' },
    thinking: { type: 'between_tools' },
  };
  const response = (await getClient().messages.create(sumParams)) as Anthropic.Messages.Message;
  if (response.stop_reason === 'refusal') {
    throw new Error('summary refused: ' + ((response as any).stop_details?.explanation ?? ''));
  }
  const summary = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  return { summary, usage: tally(response.usage) };
}
