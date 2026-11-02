import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { deletionBlocker } from "@/server/account-deletion";
import { PageHeader } from "@/components/customer/page-header";
import { DeleteAccountForm, ClosureRequestForm } from "@/components/customer/delete-account-form";
import { getT } from "@/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Delete account", robots: { index: false } };

export default async function DeleteAccountPage() {
  const t = await getT();
  const user = await requireUser("/account/delete");
  const block = await deletionBlocker(user.id);
  return (
    <main className="pb-nav">
      <PageHeader title={t("Delete account")} />
      <div className="container-app max-w-lg space-y-5 pt-4">
        {block.ok || block.reason === "open_order" ? (
          <>
            <div className="card space-y-3 p-5 text-sm">
              <h2 className="text-lg font-extrabold">{t("What happens when you delete your account")}</h2>
              <ul className="list-disc space-y-1.5 ps-5 text-ink-soft">
                <li>{t("Your profile, saved addresses, saved items, likes and reviews are deleted.")}</li>
                <li>{t("Past orders stay with the restaurants for their records, without your name, phone or address.")}</li>
                <li>{t("You'll be logged out everywhere. This can't be undone.")}</li>
              </ul>
            </div>
            <DeleteAccountForm email={user.email} blockedByOrder={!block.ok} />
          </>
        ) : block.reason === "owner" ? (
          <div className="space-y-4">
            <div className="card space-y-2 p-5 text-sm">
              <h2 className="text-lg font-extrabold">{t("You own a restaurant on numnum")}</h2>
              <p className="text-ink-soft">{t("{restaurants} needs to be closed first (open orders, invoices and staff). Send us a request and we'll close the restaurant and delete your account.", { restaurants: (block.restaurants ?? []).join(", ") })}</p>
            </div>
            <ClosureRequestForm />
          </div>
        ) : (
          <div className="card p-5 text-sm text-ink-soft">{t("Admin accounts can't be deleted from the app.")}</div>
        )}
      </div>
    </main>
  );
}
