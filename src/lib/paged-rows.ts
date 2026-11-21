type Page<T> = { data: T[] | null; error: Error | null };

/** Collect a PostgREST range query without silently truncating at its row cap. */
export async function loadPagedRows<T>(
  loadPage: (from: number, to: number) => Promise<Page<T>>,
  pageSize = 1000,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new RangeError("Page size must be a positive integer.");
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await loadPage(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
