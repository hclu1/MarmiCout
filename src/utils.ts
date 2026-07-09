/**
 * Parse un champ numérique en acceptant à la fois la virgule (,) et le point (.)
 * comme séparateur décimal. Retourne 0 si la valeur est vide ou invalide.
 *
 * Exemples :
 *   parseDecimalInput("1,5")  → 1.5
 *   parseDecimalInput("1.5")  → 1.5
 *   parseDecimalInput("12,99") → 12.99
 *   parseDecimalInput("")     → 0
 */
export function parseDecimalInput(value: string | number): number {
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  const normalized = value.replace(',', '.').trim();
  const result = parseFloat(normalized);
  return isNaN(result) ? 0 : result;
}
