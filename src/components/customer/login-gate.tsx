"use client";

import { createContext, useCallback, useContext, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bookmark, Flag, Heart } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { buttonClass } from "@/components/ui/button";
import { useT } from "@/i18n/client";

// Likes, saves and reports need an account. Guests who tap them get this sheet (log in or sign up),
// and come back to where they were afterwards.
type Reason = "like" | "save" | "report";
type Ctx = { loggedIn: boolean; requireLogin: (reason: Reason, next?: string) => boolean; askLogin: (reason: Reason, next?: string) => void };
const LoginCtx = createContext<Ctx>({ loggedIn: false, requireLogin: () => false, askLogin: () => {} });

export const useLoginGate = () => useContext(LoginCtx);

export function LoginGateProvider({ loggedIn, children }: { loggedIn: boolean; children: React.ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [ask, setAsk] = useState<{ reason: Reason; next: string } | null>(null);

  const askLogin = useCallback(
    (reason: Reason, next?: string) => setAsk({ reason, next: next ?? pathname + (sp.toString() ? `?${sp}` : "") }),
    [pathname, sp],
  );
  const requireLogin = useCallback(
    (reason: Reason, next?: string) => {
      if (loggedIn) return true;
      askLogin(reason, next);
      return false;
    },
    [loggedIn, askLogin],
  );

  const next = encodeURIComponent(ask?.next ?? "/");
  return (
    <LoginCtx.Provider value={{ loggedIn, requireLogin, askLogin }}>
      {children}
      <Sheet open={!!ask} onClose={() => setAsk(null)}>
        <div className="p-6 pt-2 text-center" data-testid="login-gate">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand-50 text-brand-500">
            {ask?.reason === "like" ? <Heart className="h-8 w-8 fill-brand-500" /> : ask?.reason === "report" ? <Flag className="h-8 w-8" /> : <Bookmark className="h-8 w-8 fill-brand-500" />}
          </div>
          <h2 className="mt-4 text-xl font-black tracking-tight">{ask?.reason === "like" ? t("Log in to like reels") : ask?.reason === "report" ? t("Log in to report content") : t("Log in to save")}</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm text-ink-muted">
            {ask?.reason === "report" ? t("Reports come from accounts so our team can follow up and keep numnum free of spam.") : t("Create a free account to like reels, save dishes and restaurants, and order with cash on delivery.")}
          </p>
          <div className="mx-auto mt-6 grid max-w-xs gap-3">
            <Link href={`/account/register?next=${next}`} className={buttonClass("primary", "lg")} onClick={() => setAsk(null)}>
              {t("Create an account")}
            </Link>
            <Link href={`/login?next=${next}`} className={buttonClass("outline", "lg")} onClick={() => setAsk(null)}>
              {t("I already have an account")}
            </Link>
          </div>
        </div>
      </Sheet>
    </LoginCtx.Provider>
  );
}
