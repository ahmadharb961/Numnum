import { requireUser } from "@/server/auth";
import { PageHeader } from "@/components/customer/page-header";
import { AccountForm } from "@/components/customer/account-form";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { formatPhone } from "@/lib/phone";

export const metadata = { title: "Account", robots: { index: false } };

export default async function AccountPage() {
  const user = await requireUser("/account");
  return (
    <main className="pb-nav">
      <PageHeader title="Your account" />
      <div className="container-app space-y-6 pt-5">
        <AccountForm name={user.name} phone={user.phone ? formatPhone(user.phone) : ""} email={user.email} />
        <form action={logoutAction}>
          <Button variant="outline" block type="submit">
            Log out
          </Button>
        </form>
      </div>
    </main>
  );
}
