import NextLink from "next/link";
import type { ComponentProps } from "react";

// Pages that change something just by being opened (mark a message read, use up an email link,
// log out). They must only load when the person really taps, never in advance.
const OPEN_ONLY_ON_TAP = /^\/(m\/|verify-email|logout|api\/)/;

/**
 * The app's link. Same as Next's, except the next screen loads fully in the background as soon as
 * the link is on screen, so tapping it shows the page at once instead of waiting for the server.
 * Pass `prefetch={false}` (or `null` for the loading screen only) where a link must not load ahead.
 */
export default function Link({ prefetch, ...props }: ComponentProps<typeof NextLink>) {
  const path = typeof props.href === "string" ? props.href : (props.href.pathname ?? "");
  const full = prefetch === true || (prefetch === undefined && !OPEN_ONLY_ON_TAP.test(path));
  // data-pf: LinkWarmer loads this link's screen again after the page refreshes.
  return <NextLink {...props} prefetch={prefetch === undefined ? full : prefetch} data-pf={full ? "" : undefined} />;
}
