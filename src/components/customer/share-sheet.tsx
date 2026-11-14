"use client";

import { useEffect, useState } from "react";
import { Copy, Share } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { WhatsAppIcon } from "@/components/brand-icons";
import { useT } from "@/i18n/client";

/**
 * Share a reel, dish or restaurant: WhatsApp first (that's how Lebanon shares), then copy the link,
 * then the phone's own share menu. The link opens straight in the numnum app where it's installed,
 * and shows a picture preview in WhatsApp (see /og/...).
 */
export function ShareSheet({ open, onClose, title, message, path, onShared }: { open: boolean; onClose: () => void; title: string; message: string; path: string; onShared?: (via: "whatsapp" | "copy" | "native") => void }) {
  const t = useT();
  const toast = useToast();
  const [canNative, setCanNative] = useState(false);
  useEffect(() => setCanNative(typeof navigator !== "undefined" && !!navigator.share), []);
  const url = () => `${location.origin}${path}`;

  const done = (via: "whatsapp" | "copy" | "native") => {
    onShared?.(via);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("Share")}>
      <div className="grid gap-2 p-4 pt-1" data-testid="share-sheet">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${message}\n${typeof location !== "undefined" ? url() : path}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => done("whatsapp")}
          className="flex h-14 items-center gap-3 rounded-2xl bg-[#25D366] px-4 text-base font-bold text-white active:scale-[0.98]"
          data-testid="share-whatsapp"
        >
          <WhatsAppIcon className="h-6 w-6" /> {t("Share on WhatsApp")}
        </a>
        <button
          className="flex h-14 items-center gap-3 rounded-2xl bg-black/5 px-4 text-base font-bold active:scale-[0.98]"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url());
              toast(t("Link copied"), "success");
            } catch {
              prompt(t("Copy this link"), url());
            }
            done("copy");
          }}
          data-testid="share-copy"
        >
          <Copy className="h-5 w-5" /> {t("Copy link")}
        </button>
        {canNative && (
          <button
            className="flex h-14 items-center gap-3 rounded-2xl bg-black/5 px-4 text-base font-bold active:scale-[0.98]"
            onClick={async () => {
              try {
                await navigator.share({ title, text: message, url: url() });
                done("native");
              } catch {
                // closed the phone's menu: keep this sheet open
              }
            }}
          >
            <Share className="h-5 w-5" /> {t("More options")}
          </button>
        )}
      </div>
    </Sheet>
  );
}
