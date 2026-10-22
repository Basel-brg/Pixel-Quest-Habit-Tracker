/** API date-only fields can arrive as midnight ISO timestamps after validation. */
export function dateKey(value: string | Date): string {
  return (value instanceof Date ? value.toISOString() : value).slice(0, 10);
}
