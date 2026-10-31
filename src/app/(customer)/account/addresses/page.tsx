import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/customer/page-header";
import { AddressBook } from "@/components/customer/address-book";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Saved addresses"), robots: { index: false } };
}

export default async function AddressesPage() {
  const user = await requireUser("/account/addresses");
  const list = await prisma.customerAddress.findMany({ where: { userId: user.id }, orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] });
  return (
    <main className="pb-nav">
      <PageHeader title="Saved addresses" />
      <div className="container-app pt-4">
        <AddressBook addresses={list.map((a) => ({ id: a.id, label: a.label, area: a.area ?? "", address: a.address, building: a.building ?? "", notes: a.notes ?? "", mapsUrl: a.latitude != null ? "" : a.mapsUrl ?? "", latitude: a.latitude, longitude: a.longitude, isDefault: a.isDefault }))} />
      </div>
    </main>
  );
}
