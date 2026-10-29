"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "./track";

export function ReopenWhatsApp({ reference }: { reference: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="lg"
      block
      loading={busy}
      variant="whatsapp"
      onClick={async () => {
        setBusy(true);
        try {
          const { whatsappUrl } = await api<{ whatsappUrl: string }>(`/api/orders/${reference}/handoff`);
          window.location.assign(whatsappUrl);
        } finally {
          setBusy(false);
        }
      }}
    >
      <MessageCircle className="h-5 w-5" /> Open WhatsApp again
    </Button>
  );
}
