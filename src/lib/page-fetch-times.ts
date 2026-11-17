// When each screen last came from the server (in this tab), loaded in advance or opened.
// Lets FreshOnNavigate skip refreshing a screen that is only seconds old.
const fetched = new Map<string, number>();

/** The address of a screen without Next's internal `_rsc` parameter. */
export function screenKey(url: URL): string {
  const u = new URL(url.href);
  u.searchParams.delete("_rsc");
  return u.pathname + u.search;
}

export function markScreenFetched(url: URL) {
  fetched.set(screenKey(url), Date.now());
  if (fetched.size > 500) fetched.delete(fetched.keys().next().value!);
}

/** Milliseconds since the screen at this address last came from the server (Infinity if never). */
export function screenAge(url: URL): number {
  const t = fetched.get(screenKey(url));
  return t === undefined ? Infinity : Date.now() - t;
}

/** Something was saved: copies loaded before may be out of date, so none counts as fresh. */
export function forgetScreenTimes() {
  fetched.clear();
}
