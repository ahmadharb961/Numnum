// Android app links: proves to Android that numnum.me links may open in the numnum app. Needs the
// SHA-256 fingerprint of the app's signing certificate (Google Play Console → Test and release →
// App integrity → App signing), set as ANDROID_CERT_SHA256 (comma-separate several).
export const dynamic = "force-dynamic";

export function GET() {
  const prints = (process.env.ANDROID_CERT_SHA256 || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!prints.length) return new Response("Not configured", { status: 404 });
  const body = [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: "me.numnum.app", sha256_cert_fingerprints: prints } }];
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" } });
}
