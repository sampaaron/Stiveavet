/** Nombre suivi du mot accordé, à la française : 0 et 1 au singulier (« 1 suivi », « 2 suivis »). */
export function nombre(count: number, one: string, many: string): string {
  return `${count} ${Math.abs(count) >= 2 ? many : one}`;
}
