"use client";

import { useEffect } from "react";
import { markMyNotificationsReadAction } from "@/actions/notifications";

/** Opening the notifications marks them read (once the page is on screen, not when preloaded). */
export function MarkNotificationsSeen({ unread }: { unread: number }) {
  useEffect(() => {
    if (unread) void markMyNotificationsReadAction().catch(() => {});
  }, [unread]);
  return null;
}
