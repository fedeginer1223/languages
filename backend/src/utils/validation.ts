/**
 * Normaliza una respuesta para comparación estricta
 * - Convierte a minúsculas
 * - Elimina espacios al inicio y al final
 * - Elimina puntuación al final
 * - MANTIENE acentos y orden de letras
 */
export function normalizeAnswer(answer: string): string {
  return answer
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
 * Calcula el porcentaje de acierto
 */
export function calculateSuccessRate(correctCount: number, attempts: number): number {
  if (attempts === 0) return 0;
  return Math.round((correctCount / attempts) * 100 * 10) / 10; // Un decimal
}
