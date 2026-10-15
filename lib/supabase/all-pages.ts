/**
 * Read every row of a PostgREST read 1000 at a time (the API returns at most 1000 per request).
 * The read must be ordered on a unique column so pages never overlap or skip. On an error it
 * returns no rows, exactly as the single read it replaces did (speed plan, 2026-10-15).
 */
export async function allPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) return [];
    const rows = (data as T[] | null) ?? [];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
