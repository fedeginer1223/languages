import Anthropic from '@anthropic-ai/sdk';

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

export type Verdict = 'valid' | 'awkward' | 'invalid';

export interface JudgeResult {
  verdict: Verdict;
  suggestion?: string;
  reason?: string;
}

export interface JudgeInput {
  languageName: string;
  pattern: string;
  examples: string[];
  cue: string;
  userResponse: string;
}

export interface CueInput {
  languageName: string;
  pattern: string;
  examples: string[];
  category: string;
  excludeCues?: string[];
}

export interface ScaffoldInput {
  languageName: string;
  seed: string;
  categories: { value: string; label: string; guide: string }[];
}

export interface ScaffoldResult {
  pattern: string;
  category: string;
  examples: string[];
}

export interface SuggestInput {
  languageName: string;
  pattern: string;
  examples: string[];
  cue: string;
}

export interface TranslationExample {
  spanish: string;
  target: string;
}

export interface GenerateExamplesInput {
  languageName: string;
  pattern: string;
  category: string;
  count: number;
  /** Optional seed examples that came with the structure. Improves grounding for the AI. */
  seedExamples?: string[];
  /** Avoid repeating these spanish prompts (used on regeneration). */
  excludeSpanish?: string[];
}

function safeJsonParse<T>(raw: string): T | null {
  // Strip ```json fences if present, then parse
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Try to extract first {...} block
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export const structureAiService = {
  /**
   * Generate a situational cue (in Spanish) for the learner to produce a variant
   * of the structure. The cue is a real-world micro-scenario, not a translation.
   */
  async generateCue(input: CueInput): Promise<string> {
    const exclude = input.excludeCues && input.excludeCues.length > 0
      ? `\nNo repitas estas situaciones: ${input.excludeCues.map((c) => `"${c}"`).join(', ')}.`
      : '';

    const prompt = `Eres un coach de ${input.languageName}. Diseñas micro-escenarios para que un estudiante avanzado practique estructuras hechas hasta automatizarlas.

ESTRUCTURA:  ${input.pattern}
CATEGORÍA:   ${input.category}
EJEMPLOS:    ${input.examples.map((e) => `"${e}"`).join(' · ')}

TAREA:
Genera UNA situación realista (1 frase corta en español, máximo 20 palabras) en la que el estudiante necesitaría usar esta estructura. Debe ser una situación cotidiana o profesional, suficientemente específica para forzar a producir una variante concreta — NO una traducción literal.${exclude}

Devuelve SOLO el cue, sin comillas, sin prefijos, sin explicaciones.`;

    const res = await getClient().messages.create({
      model: MODEL,
      max_tokens: 80,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = res.content[0].type === 'text' ? res.content[0].text.trim() : '';
    // Strip stray quotes
    return text.replace(/^["'`]|["'`]$/g, '').trim();
  },

  /**
   * Judge a user's variant against the target pattern.
   * Returns verdict + optional suggestion.
   */
  async judgeVariant(input: JudgeInput): Promise<JudgeResult> {
    const prompt = `Eres un evaluador BENÉVOLO de uso de estructuras hechas en ${input.languageName}. Tu única tarea es juzgar si la respuesta del estudiante USA el marco sintáctico del patrón objetivo. Tu sesgo por defecto es ACEPTAR la respuesta.

ESTRUCTURA OBJETIVO:  ${input.pattern}
EJEMPLOS DE USO:      ${input.examples.map((e) => `"${e}"`).join(' · ')}

SITUACIÓN (en español): ${input.cue}
RESPUESTA DEL ESTUDIANTE: "${input.userResponse}"

REGLAS DURAS DE EVALUACIÓN (no las puedes saltar):
- REGLA DE ORO: Si las palabras fijas del patrón objetivo (las que NO son ___) aparecen DENTRO de la respuesta del estudiante en el mismo orden, EL ESTUDIANTE USA EL PATRÓN. Da igual lo que haya antes o después, da igual cuántas oraciones haya alrededor, da igual si añade "but", "and", "however", subordinadas, etc. En ese caso el veredicto NUNCA puede ser "invalid".
  - Ejemplo: patrón "___ in the same breath" + respuesta "You say he treats you badly, but in the same breath you tell me how much you love him" → valid. Aunque haya un "but" antes, el patrón aparece literalmente.
  - Ejemplo: patrón "off the top of my head" + respuesta "I don't know off the top of my head but I can check" → valid.
- IGNORA TOTALMENTE: comas, puntos, signos de exclamación/interrogación, mayúsculas/minúsculas (incluso en nombres propios y comienzo de frase), apóstrofes rectos vs curvos, espacios extra. Estas cosas NUNCA convierten una respuesta en "awkward" o "invalid".
- IGNORA: típos menores que no cambian el significado (una letra mal puesta en una palabra cualquiera).
- ACEPTA sinónimos y variaciones léxicas menores de las partes fijas del patrón si el MARCO SINTÁCTICO se conserva. Ej: si el patrón es "It would be a great pleasure ___ if you would ___" y el estudiante escribe "It would be a great honor for me if you would join us" → valid. "It would be nice if you would ___" también es valid si conserva la intención de petición cortés condicional.
- LINKING VERBS son intercambiables: seems / looks / appears / feels / sounds. Si el patrón es "At first glance, ___ seems ___" y el estudiante escribe "At first glance it looks solid" → VALID. Cambiar uno por otro NUNCA convierte la respuesta en invalid o awkward.
- ACEPTA variaciones de tiempo verbal, persona y modalidad si encajan con la situación.
- ACEPTA que la respuesta sea una oración compuesta o un párrafo que contenga el patrón dentro. No exijas que el patrón sea TODA la respuesta.
- NO juzgues el contenido, la opinión, ni si es "muy genérica".
- NO seas pedante: si en duda, marca "valid".

CRITERIOS (en este orden, primero que aplique gana):
- "invalid": SOLO cuando la respuesta NO contiene las palabras fijas del patrón (ni sinónimos cercanos) en orden razonable, O tiene un error gramatical GRAVE que rompe la oración. Si la regla de oro se cumple, NO uses invalid.
- "awkward": usa el patrón pero hay UN error lingüístico REAL y concreto que merece la pena señalar (preposición claramente equivocada para esta colocación, tiempo verbal incongruente con la situación). Da una sugerencia natural. NO uses awkward para meras preferencias estilísticas ni porque añada cláusulas extra.
- "valid":   POR DEFECTO. Usa el patrón (literal o con variación léxica menor) y se entiende. La puntuación, mayúsculas, y oraciones extra alrededor NO afectan a este veredicto.

Responde SOLO con un JSON en este formato exacto, sin texto extra ni markdown:
{"verdict": "valid"|"awkward"|"invalid", "suggestion": "frase corregida o null", "reason": "breve, máx 15 palabras"}`;

    const res = await getClient().messages.create({
      model: MODEL,
      max_tokens: 250,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = res.content[0].type === 'text' ? res.content[0].text : '';
    const parsed = safeJsonParse<JudgeResult>(text);
    if (!parsed || !['valid', 'awkward', 'invalid'].includes(parsed.verdict)) {
      // Defensive fallback: don't break the session if AI hiccups
      return { verdict: 'awkward', reason: 'no se pudo evaluar' };
    }
    // Normalize "null" string suggestion
    if (parsed.suggestion === 'null' || parsed.suggestion === '') {
      parsed.suggestion = undefined;
    }
    return parsed;
  },

  /**
   * Generate a natural sentence in the target language that uses the pattern
   * to answer the given cue. Used when the student submits empty or fails —
   * they'll be shown this sentence and asked to retype it literally.
   */
  async suggestForCue(input: SuggestInput): Promise<{ suggestion: string }> {
    const prompt = `Eres un profesor de ${input.languageName}. Un estudiante tiene que producir una variante de esta estructura para la situación dada, pero no ha sabido hacerlo. Le vas a dar UNA respuesta modelo que él copiará literalmente para memorizarla.

ESTRUCTURA:  ${input.pattern}
EJEMPLOS:    ${input.examples.map((e) => `"${e}"`).join(' · ')}
SITUACIÓN:   ${input.cue}

TAREA:
Escribe UNA sola frase en ${input.languageName} que:
1. Use el patrón "${input.pattern}" (respeta las palabras fijas; rellena los ___ con contenido específico).
2. Encaje con la situación descrita, de forma natural y directa.
3. Sea corta (máximo 20 palabras) y NADA genérica: el contenido debe reflejar el contexto concreto de la situación.

Devuelve SOLO la frase, sin comillas, sin prefijos ("Ejemplo:", "Respuesta:"), sin explicaciones.`;

    const res = await getClient().messages.create({
      model: MODEL,
      max_tokens: 120,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content[0].type === 'text' ? res.content[0].text.trim() : '';
    const cleaned = text.replace(/^["'`]|["'`]$/g, '').trim();
    return { suggestion: cleaned || input.examples[0] || '' };
  },

  /**
   * Generate N translation practice examples for a structure. Each example is
   * a Spanish prompt + a target-language reference translation. The reference
   * MUST be grammatically correct and MUST use the structure. If the pattern
   * has multiple distinct uses, all of them should be represented; if there
   * are more examples than uses, uses may repeat.
   */
  async generateExamples(input: GenerateExamplesInput): Promise<TranslationExample[]> {
    const seedBlock = input.seedExamples && input.seedExamples.length > 0
      ? `\nEJEMPLOS DE USO CONOCIDOS (referencia de cómo suena natural): ${input.seedExamples.map((e) => `"${e}"`).join(' · ')}`
      : '';
    const excludeBlock = input.excludeSpanish && input.excludeSpanish.length > 0
      ? `\nEVITA repetir estos prompts en español: ${input.excludeSpanish.map((s) => `"${s}"`).join(' · ')}`
      : '';

    const prompt = `Eres un profesor de ${input.languageName} y traductor experto. Tu tarea es generar EJEMPLOS DE TRADUCCIÓN para que un estudiante practique una estructura hecha.

ESTRUCTURA:  ${input.pattern}
CATEGORÍA:   ${input.category}${seedBlock}${excludeBlock}

TAREA:
Genera exactamente ${input.count} ejemplos. Cada ejemplo tiene:
- "spanish": una frase natural en español que el estudiante va a traducir. Corta (máx 20 palabras), cotidiana o realista.
- "target": la traducción de esa frase al ${input.languageName}, que DEBE USAR el patrón "${input.pattern}".

REGLAS CRÍTICAS (no las puedes saltar):
1. **Corrección gramatical**: cada "target" debe ser GRAMATICALMENTE PERFECTO en ${input.languageName}. No inventes formas verbales, no forces la sintaxis. Si dudas de una forma, elige una más simple que sea correcta al 100%.
2. **Uso del patrón**: la parte fija del patrón debe aparecer literal (o con la variación mínima que la gramática exija, ej. conjugación del verbo o género/número del adjetivo). Los slots (___) los rellenas con contenido específico.
3. **Cobertura de usos**: si el patrón tiene varios usos o matices semánticos distintos (por ejemplo, un patrón que sirve para hipótesis y también para consecuencia lógica), reparte los ${input.count} ejemplos entre TODOS los usos. Si hay menos usos distintos que ejemplos pedidos, puedes repetir un uso en varios ejemplos, pero varía el contexto (dominio: trabajo, familia, viajes, etc.).
4. **Naturalidad en español**: los prompts en español deben sonar como algo que un hispanohablante diría, NO como traducción literal del ${input.languageName}. El estudiante va del español al ${input.languageName}, así que el español manda como estímulo natural.
5. **Variedad de contextos**: no repitas el mismo dominio en todos los ejemplos.
6. **Sin metaexplicación**: no incluyas notas, comentarios, ni marcadores de uso en el JSON.

Responde SOLO con un JSON en este formato exacto, sin markdown ni texto extra:
{"examples": [{"spanish": "...", "target": "..."}, ...]}`;

    const res = await getClient().messages.create({
      model: MODEL,
      max_tokens: Math.min(4000, 200 + input.count * 120),
      messages: [{ role: 'user', content: prompt }],
    });

    const text = res.content[0].type === 'text' ? res.content[0].text : '';
    const parsed = safeJsonParse<{ examples: TranslationExample[] }>(text);
    if (!parsed || !Array.isArray(parsed.examples)) {
      throw new Error('AI did not return usable translation examples');
    }
    const cleaned = parsed.examples
      .map((e) => ({
        spanish: String(e.spanish ?? '').trim(),
        target: String(e.target ?? '').trim(),
      }))
      .filter((e) => e.spanish.length > 0 && e.target.length > 0)
      .slice(0, input.count);
    if (cleaned.length === 0) {
      throw new Error('AI returned no usable examples');
    }
    return cleaned;
  },

  /**
   * Given a seed example (one natural sentence from the user), produce a
   * reusable structure: an abstract pattern (with ___ slot if applicable),
   * a category from the provided list, and 2-3 additional example variants.
   */
  async scaffoldFromExample(input: ScaffoldInput): Promise<ScaffoldResult> {
    const categoryList = input.categories
      .map((c) => `- "${c.value}" (${c.label}): ${c.guide}`)
      .join('\n');
    const validValues = input.categories.map((c) => c.value);

    const prompt = `Eres un experto en adquisición de lenguas y chunks (formulaic language) en ${input.languageName}. El estudiante te da UNA frase suelta y tu trabajo es destilar de ella una "estructura hecha" reutilizable que pueda practicar.

FRASE SEMILLA DEL ESTUDIANTE:
"${input.seed}"

TAREA:
1. **pattern**: extrae el patrón abstracto que se podría reutilizar en otras situaciones. Usa "___" para marcar el slot variable (lo que cambia entre usos). Si la estructura es una frase fija sin slot real, no pongas ___. El patrón debe ser CORTO (la parte fija + slot), no la frase entera.
   Ejemplo: "I let there be no mistakes about this" → patrón "let there be no ___ about ___" (o "let there be no ___" si crees que el segundo slot no aporta).
   Ejemplo: "Off the top of my head" → patrón "off the top of my head" (frase fija, sin slot).

2. **category**: elige UNA categoría de esta lista basándote en la FUNCIÓN comunicativa, no en la forma:
${categoryList}

3. **examples**: devuelve 3 ejemplos completos y naturales en ${input.languageName} que usan el patrón. El PRIMER ejemplo debe ser EXACTAMENTE la frase semilla del estudiante (sin cambios). Los otros 2 deben ser variantes en contextos distintos para que el estudiante vea cómo flexionar el slot.

REGLAS:
- Los ejemplos son frases naturales completas, no fragmentos.
- No traduzcas. Todo en ${input.languageName}.
- Si la frase semilla tiene un error gramatical pequeño, ARREGLALO en el primer ejemplo (y úsalo como base del patrón).
- category DEBE ser exactamente uno de: ${validValues.join(', ')}.

Responde SOLO con un JSON en este formato exacto, sin markdown ni texto extra:
{"pattern": "...", "category": "...", "examples": ["...", "...", "..."]}`;

    const res = await getClient().messages.create({
      model: MODEL,
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = res.content[0].type === 'text' ? res.content[0].text : '';
    const parsed = safeJsonParse<ScaffoldResult>(text);
    if (!parsed || typeof parsed.pattern !== 'string' || !Array.isArray(parsed.examples)) {
      throw new Error('AI did not return a usable scaffold');
    }
    // Defensive: clamp category to valid set, fall back to 'other'
    if (!validValues.includes(parsed.category)) {
      parsed.category = validValues.includes('other') ? 'other' : validValues[0];
    }
    // Trim and dedupe examples, ensure seed is first
    const cleaned = parsed.examples.map((e) => String(e).trim()).filter((e) => e.length > 0);
    const seedTrim = input.seed.trim();
    const withoutSeed = cleaned.filter((e) => e.toLowerCase() !== seedTrim.toLowerCase());
    parsed.examples = [seedTrim, ...withoutSeed].slice(0, 4);
    parsed.pattern = parsed.pattern.trim();
    return parsed;
  },
};
