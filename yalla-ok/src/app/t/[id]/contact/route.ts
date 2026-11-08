import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMobileUserAgent, whatsappMessage, whatsappUrl } from "@/lib/whatsapp";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * The only place a poster's WhatsApp number leaves the server: a redirect
 * into a WhatsApp chat, for live tasks only.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const back = new URL(`/t/${id}`, request.url);
  const noStore = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

  if (!isSupabaseConfigured || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.redirect(new URL("/", request.url), { status: 303, headers: noStore });
  }

  const admin = createAdminClient();
  const { data: task } = await admin
    .from("tasks")
    .select("id, headline, status, expires_at, is_demo, task_contacts(whatsapp)")
    .eq("id", id)
    .maybeSingle();

  const contact = task?.task_contacts as unknown as { whatsapp: string } | { whatsapp: string }[] | null;
  const whatsapp = Array.isArray(contact) ? contact[0]?.whatsapp : contact?.whatsapp;

  if (!task || task.status !== "active" || !task.expires_at || new Date(task.expires_at) <= new Date() || !whatsapp) {
    return NextResponse.redirect(back, { status: 303, headers: noStore });
  }
  if (task.is_demo) {
    back.searchParams.set("demo", "1");
    return NextResponse.redirect(back, { status: 303, headers: noStore });
  }

  const url = whatsappUrl(whatsapp, whatsappMessage(task.headline), isMobileUserAgent(request.headers.get("user-agent")));
  return NextResponse.redirect(url, { status: 303, headers: noStore });
}
