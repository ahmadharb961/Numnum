import { getCurrentUser } from "@/server/auth";
import { deviceId } from "@/server/request";
import { cancelGroup, groupState, joinGroup, leaveGroup, lockGroup, markGroupOrdered, removeMember, setMyLines, unlockGroup } from "@/server/group-carts";
import { errorResponse, json, limit, readJson } from "@/server/http";

async function viewer() {
  const device = await deviceId();
  if (!device) throw Object.assign(new Error("Please reload the page and try again"), { status: 400 });
  const user = await getCurrentUser();
  return { device, userId: user?.id ?? null, name: user?.name ?? null };
}

/** The group as everyone sees it (polled every few seconds while the group screen is open). */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    await limit("group-read", 120, 60_000);
    const { code } = await params;
    return json(await groupState(code, await viewer()), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

type Body = { action?: string; name?: string; lines?: unknown; memberId?: string; reference?: string };

/** join · lines (my items) · lock / unlock (host checking out) · ordered · remove · leave · cancel */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    await limit("group-write", 120, 60_000);
    const { code } = await params;
    const v = await viewer();
    const body = await readJson<Body>(req, 64_000);
    switch (body.action) {
      case "join":
        await joinGroup(code, v, String(body.name ?? v.name ?? ""));
        break;
      case "lines":
        await setMyLines(code, v, body.lines ?? []);
        break;
      case "lock":
        return json(await lockGroup(code, v));
      case "unlock":
        await unlockGroup(code, v);
        break;
      case "ordered":
        await markGroupOrdered(code, v, String(body.reference ?? ""));
        break;
      case "remove":
        await removeMember(code, v, String(body.memberId ?? ""));
        break;
      case "leave":
        await leaveGroup(code, v);
        break;
      case "cancel":
        await cancelGroup(code, v);
        break;
      default:
        return json({ error: "Unknown action" }, 400);
    }
    return json(await groupState(code, v));
  } catch (e) {
    return errorResponse(e);
  }
}
