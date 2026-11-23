/**
 * Normaliza una respuesta para comparación estricta
 * - Convierte a minúsculas
 * - Elimina espacios al inicio y al final
 * - Elimina puntuación al final
 * - MANTIENE acentos y orden de letras
 */
export function normalizeAnswer(answer: string): string {
  return answer
    .normalize('NFC') // canonicalize composed vs decomposed accents (é vs e+́)
    .toLowerCase()
    .trim()
    .replace(/[.!?,;:]+$/, ''); // Solo elimina puntuación al final
}

/**
 * Valida si la respuesta del usuario es correcta
 * Modo estricto: respeta acentos y orden de letras
 */
export function validateAnswer(userAnswer: string, correctAnswer: string): boolean {
  const normalized1 = normalizeAnswer(userAnswer);
  const normalized2 = normalizeAnswer(correctAnswer);

  return normalized1 === normalized2;
}

/**
 * Elimina el pronombre sujeto francés al principio de la conjugación
 * (je, tu, il, elle, on, nous, vous, ils, elles, j'). Se aplica en los dos
 * lados de la comparación para verbos, de modo que el pronombre sea opcional
 * al escribir la respuesta.
 */
export function stripFrenchSubjectPronoun(s: string): string {
  return s
    .trimStart()
    .replace(/^j['’]\s*/i, '')
    .replace(/^(je|tu|il|elle|on|nous|vous|ils|elles)\s+/i, '')
    .trimStart();
}

/**
 * Igual que validateAnswer pero ignora el pronombre sujeto en cualquiera
 * de los dos lados. Usar solo para conjugaciones de verbos.
 */
export function validateConjugationAnswer(userAnswer: string, correctAnswer: string): boolean {
  return validateAnswer(
    stripFrenchSubjectPronoun(userAnswer),
    stripFrenchSubjectPronoun(correctAnswer)
  );
}

/**
 * Calcula el porcentaje de acierto
 */
export function calculateSuccessRate(correctCount: number, attempts: number): number {
  if (attempts === 0) return 0;
  return Math.round((correctCount / attempts) * 100 * 10) / 10; // Un decimal
}

/**
 * Calcula el weighted score basado en los últimos intentos
 * Peso exponencial: i^3 donde i es la posición (más reciente = más peso)
 * Resultado: 0-100
 */
export function calculateWeightedScore(recentResults: string): number {
  if (!recentResults || recentResults.length === 0) return 0;

  let totalWeight = 0;
  let weightedSum = 0;

  for (let i = 0; i < recentResults.length; i++) {
    const position = i + 1; // 1-based, most recent = highest
    const weight = Math.pow(position, 3);
    const correct = recentResults[i] === '1' ? 1 : 0;

    weightedSum += correct * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;
  return Math.round((weightedSum / totalWeight) * 100 * 10) / 10;
}
