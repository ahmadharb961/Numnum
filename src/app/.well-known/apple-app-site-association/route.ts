// iPhone universal links: tells iOS that numnum.me links (shared reels, dishes, restaurants,
// orders) belong to the numnum app, so they open in it instead of Safari. Uses the Apple Team ID
// already set for iPhone notifications (APNS_TEAM_ID) and the app's bundle id.
export const dynamic = "force-dynamic";

export function GET() {
  const team = process.env.APPLE_TEAM_ID || process.env.APNS_TEAM_ID;
  if (!team) return new Response("Not configured", { status: 404 });
  const appID = `${team}.${process.env.APNS_BUNDLE_ID || "me.numnum.app"}`;
  const body = { applinks: { details: [{ appIDs: [appID], components: ["/reel/*", "/r/*", "/item/*", "/order/*"].map((p) => ({ "/": p })) }] } };
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" } });
}
