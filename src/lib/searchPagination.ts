export const SEARCH_PAGE_SIZE = 12;

export function paginateResults<T>(items: readonly T[], requestedPage: number, pageSize = SEARCH_PAGE_SIZE) {
  const safePageSize = Math.max(1, Math.trunc(pageSize) || SEARCH_PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(items.length / safePageSize));
  const page = Math.min(Math.max(1, Math.trunc(requestedPage) || 1), pageCount);
  const start = (page - 1) * safePageSize;
  return { items: items.slice(start, start + safePageSize), page, pageCount };
}
