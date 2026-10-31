import Link from "next/link";
import { DashPage } from "@/components/dashboard/page";
import { RestaurantCreateForm } from "@/components/admin/restaurant-create-form";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Add restaurant" };

export default async function NewRestaurantPage() {
  const s = await getSettings();
  return (
    <DashPage
      title="Add a restaurant"
      description="Create the restaurant and its owner's login. Then add the menu, photos and reels from its dashboard."
      actions={
        <Link href="/admin/restaurants" className="chip">
          Cancel
        </Link>
      }
    >
      <RestaurantCreateForm defaultRate={s.defaultCommissionRateBps / 100} />
    </DashPage>
  );
}
