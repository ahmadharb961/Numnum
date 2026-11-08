import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import type { Quota } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import { Notice, PageTitle } from "@/components/ui";
import { PostForm } from "./post-form";

export const metadata: Metadata = { title: "Post a Task", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PostPage() {
  const { supabase, profile } = await requireUser("/post");
  const settings = await getSettings();
  const { data } = await supabase.rpc("my_posting_quota").maybeSingle<Quota>();
  const quota = data ?? { free_total: 0, free_used: 0, free_left: 0, fee_cents: settings.posting_fee_cents, currency: settings.currency };
  const fee = formatMoney(quota.fee_cents, quota.currency);
  const free = quota.free_left > 0 || quota.fee_cents === 0;

  return (
    <div className="mx-auto max-w-xl">
      <PageTitle sub="Takes about 30 seconds. The countdown starts when it’s published.">Post a Task</PageTitle>

      {profile.status !== "active" ? (
        <Notice tone="error" title="Your account can’t post right now">
          Contact support if you think this is a mistake.
        </Notice>
      ) : (
        <>
          {quota.fee_cents === 0 ? null : free ? (
            <Notice tone="success" className="mb-6" title={`${quota.free_left} free ${quota.free_left === 1 ? "post" : "posts"} left`}>
              This one is on us. After your free posts, publishing costs {fee} via Whish.
            </Notice>
          ) : (
            <Notice tone="warning" className="mb-6" title={`Publishing costs ${fee}`}>
              You’ve used your free posts. After you fill this in, you’ll pay {fee} through Whish Money. Your task goes live
              as soon as we confirm the payment.
            </Notice>
          )}
          <PostForm durations={settings.allowed_durations} submitLabel={free ? "Publish task" : `Continue to payment (${fee})`} />
        </>
      )}
    </div>
  );
}
