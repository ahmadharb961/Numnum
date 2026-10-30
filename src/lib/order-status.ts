// Order lifecycle shared by customer, restaurant and admin views.

export type OrderStatusKey = "PLACED" | "ACCEPTED" | "PREPARING" | "OUT_FOR_DELIVERY" | "READY_FOR_PICKUP" | "COMPLETED" | "REJECTED" | "CANCELED" | "FAILED";

export const STATUS_META: Record<OrderStatusKey, { label: string; customer: string; tone: "gray" | "blue" | "amber" | "green" | "red" | "purple" | "brand" }> = {
  PLACED: { label: "New", customer: "Waiting for the restaurant to accept", tone: "brand" },
  ACCEPTED: { label: "Accepted", customer: "Accepted by the restaurant", tone: "blue" },
  PREPARING: { label: "Preparing", customer: "Your food is being prepared", tone: "amber" },
  OUT_FOR_DELIVERY: { label: "Out for delivery", customer: "On the way to you", tone: "purple" },
  READY_FOR_PICKUP: { label: "Ready for pickup", customer: "Ready — you can pick it up", tone: "purple" },
  COMPLETED: { label: "Completed", customer: "Delivered", tone: "green" },
  REJECTED: { label: "Rejected", customer: "The restaurant couldn't take this order", tone: "red" },
  CANCELED: { label: "Canceled", customer: "Canceled", tone: "red" },
  FAILED: { label: "Not delivered", customer: "The order couldn't be delivered", tone: "red" },
};

export const ACTIVE_STATUSES: OrderStatusKey[] = ["PLACED", "ACCEPTED", "PREPARING", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP"];
export const IN_PROGRESS_STATUSES: OrderStatusKey[] = ["ACCEPTED", "PREPARING", "OUT_FOR_DELIVERY", "READY_FOR_PICKUP"];
export const CLOSED_STATUSES: OrderStatusKey[] = ["COMPLETED", "REJECTED", "CANCELED", "FAILED"];

export function isActive(s: string) {
  return (ACTIVE_STATUSES as string[]).includes(s);
}
