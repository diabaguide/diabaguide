export type PhotoUrlBatchResult = { url: string | null; missing: boolean };
export type PhotoUrlBatchLookup = (paths: string[]) => Promise<ReadonlyMap<string, PhotoUrlBatchResult>>;
export type PhotoUrlSigningItem = { error: string | null; path: string | null; signedUrl: string | null };

export function mapPhotoUrlBatchResults(
  paths: string[],
  items: readonly PhotoUrlSigningItem[],
): ReadonlyMap<string, PhotoUrlBatchResult> {
  const results = new Map<string, PhotoUrlBatchResult>();
  for (const [index, item] of items.entries()) {
    const path = item.path ?? paths[index];
    if (!path) continue;
    const url = item.error ? null : item.signedUrl;
    const missing = !url && typeof item.error === 'string' && /\bnot found\b/i.test(item.error);
    results.set(path, { url, missing });
  }
  return results;
}

/**
 * Coalesces near-simultaneous signed-URL lookups into one storage request.
 * Duplicate paths share one result; failed or omitted paths resolve to null.
 */
export function createPhotoUrlBatcher(
  lookup: PhotoUrlBatchLookup,
  windowMs = 16,
): (path: string) => Promise<PhotoUrlBatchResult> {
  const pending = new Map<string, Array<(result: PhotoUrlBatchResult) => void>>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async () => {
    const batch = [...pending.entries()];
    pending.clear();
    timer = null;
    if (!batch.length) return;

    let results: ReadonlyMap<string, PhotoUrlBatchResult>;
    try {
      results = await lookup(batch.map(([path]) => path));
    } catch {
      results = new Map();
    }
    for (const [path, resolvers] of batch) {
      const result = results.get(path) ?? { url: null, missing: false };
      for (const resolve of resolvers) resolve(result);
    }
  };

  return (path) => new Promise<PhotoUrlBatchResult>((resolve) => {
    const resolvers = pending.get(path) ?? [];
    resolvers.push(resolve);
    pending.set(path, resolvers);
    if (timer === null) timer = setTimeout(() => { void flush(); }, windowMs);
  });
}
