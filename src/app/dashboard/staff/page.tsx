import { requireRestaurant } from "@/server/auth";
import { prisma } from "@/server/db";
import { DashPage, Section } from "@/components/dashboard/page";
import { AddStaffForm } from "@/components/dashboard/staff-form";
import { RemoveStaff } from "@/components/dashboard/simple-actions";
import { Badge } from "@/components/ui/misc";

export const metadata = { title: "Staff" };

export default async function StaffPage() {
  const ctx = await requireRestaurant("OWNER");
  const staff = await prisma.restaurantStaff.findMany({ where: { restaurantId: ctx.restaurant.id }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } });
  return (
    <DashPage title="Staff & permissions">
      <Section title="Team">
        <ul className="divide-y divide-black/5">
          {staff.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <div className="font-semibold">{s.user.name}</div>
                <div className="text-xs text-ink-muted">{s.user.email}</div>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={s.role === "OWNER" ? "brand" : s.role === "MANAGER" ? "blue" : "gray"}>{s.role.toLowerCase()}</Badge>
                {s.userId !== ctx.user.id && <RemoveStaff id={s.id} />}
              </div>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Add a team member">
        <AddStaffForm />
        <div className="mt-4 grid gap-2 text-xs text-ink-muted sm:grid-cols-3">
          <p>
            <b>Staff</b> — order requests, availability, reviews (read).
          </p>
          <p>
            <b>Manager</b> — plus menu, photos, reels, reviews replies and business details.
          </p>
          <p>
            <b>Owner</b> — everything, including billing, payments, staff and verification.
          </p>
        </div>
      </Section>
    </DashPage>
  );
}
