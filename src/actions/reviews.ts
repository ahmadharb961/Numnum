"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth";
import { submitItemReview, submitRestaurantReview } from "@/server/reviews";
import type { FormState } from "./auth";

const num = (v: FormDataEntryValue | null) => (v === null || v === "" ? null : Number(v));

export async function itemReviewAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please log in to write a review" };
  try {
    const id = String(form.get("menuItemId"));
    await submitItemReview(user, { menuItemId: id, rating: Number(form.get("rating")), body: String(form.get("body") || ""), orderReference: String(form.get("orderReference") || "") || null, photoUrl: String(form.get("photoUrl") || "") || null });
    revalidatePath(`/item/${id}`);
    return { ok: true, message: "Thanks for your review!" };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function restaurantReviewAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please log in to write a review" };
  try {
    await submitRestaurantReview(user, {
      restaurantId: String(form.get("restaurantId")),
      rating: Number(form.get("rating")),
      foodQuality: num(form.get("foodQuality")),
      service: num(form.get("service")),
      value: num(form.get("value")),
      delivery: num(form.get("delivery")),
      body: String(form.get("body") || ""),
      orderReference: String(form.get("orderReference") || "") || null,
    });
    return { ok: true, message: "Thanks for your review!" };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
