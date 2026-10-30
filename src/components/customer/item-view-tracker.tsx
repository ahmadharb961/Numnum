"use client";

import { useEffect } from "react";
import { track } from "./track";

export function ItemViewTracker({ itemId }: { itemId: string }) {
  useEffect(() => track("product_opened", { menuItemId: itemId }), [itemId]);
  return null;
}

export function RestaurantViewTracker({ restaurantId }: { restaurantId: string }) {
  useEffect(() => track("restaurant_opened", { restaurantId }), [restaurantId]);
  return null;
}
