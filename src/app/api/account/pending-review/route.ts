import { getCurrentUser } from "@/server/auth";
import { pendingOrderReview } from "@/server/reviews";
import { json } from "@/server/http";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return json({ pending: null });
  return json({ pending: await pendingOrderReview(user.id) });
}
