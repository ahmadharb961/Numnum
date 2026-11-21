"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/link";
import { Loader2, Lock, UserPlus, Users, X } from "lucide-react";
import { useCart, type Cart } from "./cart";
import { getGroup, groupApi, setGroup, useGroup, type GroupApiError } from "./group-store";
import type { GroupState } from "@/server/group-carts";
import { ShareSheet } from "./share-sheet";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Field } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/money";
import { useT } from "@/i18n/client";

type Line = GroupState["members"][number]["lines"][number];
const total = (lines: Line[]) => lines.reduce((s, l) => s + Math.max(0, l.unitBaseCents + l.unitOptionsCents) * l.quantity, 0);
const NAME_KEY = "nn_group_name";
// Set when a group was just started: the group panel opens the WhatsApp invite right away.
const INVITE_KEY = "nn_group_invite";

/** Live group state while the group screen is open (every few seconds, and after my own changes). */
export function useGroupState(code: string | null) {
  const [state, setState] = useState<GroupState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!code) return;
    try {
      setState(await groupApi(code));
      setError(null);
    } catch (e) {
      setError((e as GroupApiError).message);
    }
  }, [code]);
  useEffect(() => {
    if (!code) return;
    void refresh();
    // Live: every 2 seconds while on screen, and at once when coming back to the app or tab
    // (phones pause timers in the background).
    const tick = setInterval(() => document.visibilityState === "visible" && void refresh(), 2000);
    const back = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    window.addEventListener("pageshow", back);
    const onState = (e: Event) => setState((e as CustomEvent<GroupState>).detail);
    const onError = (e: Event) => setError((e as CustomEvent<string>).detail);
    window.addEventListener("nn:group", onState);
    window.addEventListener("nn:group-error", onError);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("focus", back);
      window.removeEventListener("pageshow", back);
      window.removeEventListener("nn:group", onState);
      window.removeEventListener("nn:group-error", onError);
    };
  }, [code, refresh]);
  return { state, setState, error, refresh };
}

const inviteText = (t: ReturnType<typeof useT>, restaurant: string) => t("I'm ordering from {restaurant} on numnum 🍔 Add what you want and I'll place one order for all of us:", { restaurant });

/** "Order with friends": starts a group from this cart and opens WhatsApp sharing. */
export function StartGroupButton({ cart }: { cart: Cart }) {
  const t = useT();
  const toast = useToast();
  const [ask, setAsk] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      setName(localStorage.getItem(NAME_KEY) ?? "");
    } catch {}
  }, []);
  async function start() {
    setBusy(true);
    try {
      const r = await fetch("/api/group", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurantId: cart.restaurantId, name: name.trim(), lines: cart.lines.map(({ key: _k, ...l }) => l) }) });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error((data?.fieldErrors && (Object.values(data.fieldErrors)[0] as string)) || data?.error || t("Something went wrong. Please try again."));
      try {
        localStorage.setItem(NAME_KEY, name.trim());
      } catch {}
      try {
        sessionStorage.setItem(INVITE_KEY, data.code);
      } catch {}
      setAsk(false);
      // The cart now shows the group panel (this button goes away), which opens the invite.
      setGroup({ code: data.code, restaurantId: cart.restaurantId, isHost: true, mode: "open" });
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" onClick={() => setAsk(true)} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-brand-200 bg-brand-50 text-sm font-bold text-brand-700 active:scale-[0.99]" data-testid="start-group">
        <Users className="h-5 w-5" /> {t("Order with friends")}
      </button>
      <Sheet open={ask} onClose={() => setAsk(false)} title={t("Order with friends")}>
        <div className="space-y-4 p-5">
          <p className="text-sm text-ink-soft">{t("Share a link on WhatsApp. Friends or colleagues add their meals under their name, and you place one order for everyone.")}</p>
          <Field label={t("Your name")} htmlFor="group-name">
            <input id="group-name" className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Ahmad")} autoFocus />
          </Field>
          <Button size="lg" block onClick={start} disabled={busy || !name.trim()} data-testid="create-group">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserPlus className="h-5 w-5" />} {t("Start group order")}
          </Button>
        </div>
      </Sheet>
    </>
  );
}

/** On the cart while in a group: who's in, what each picked, inviting more, and checkout for everyone. */
export function GroupPanel({ cart }: { cart: Cart | null }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const g = useGroup();
  const { replaceWith, clear } = useCart();
  const { state, setState, error } = useGroupState(g?.code ?? null);
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState(false);
  // Just started: invite friends right away.
  useEffect(() => {
    if (!g || !state || state.status !== "OPEN") return;
    try {
      if (sessionStorage.getItem(INVITE_KEY) === g.code) {
        sessionStorage.removeItem(INVITE_KEY);
        setInvite(true);
      }
    } catch {}
  }, [g, state]);

  // Leaving the group (ended, left, ordered): back to a normal cart.
  const done = (keepCart = false) => {
    setGroup(null);
    if (!keepCart) clear();
  };
  if (!g) return null;
  const currency = state?.restaurant.currency ?? cart?.currency ?? "USD";
  const others = state?.members.filter((m) => !m.isMe) ?? [];
  const me = state?.members.find((m) => m.isMe);
  const everyone = state ? state.members.reduce((s, m) => s + total(m.isMe && cart && g.mode === "open" ? cart.lines : m.lines), 0) : 0;

  async function act(body: Record<string, unknown>, after?: (s: GroupState) => void) {
    if (!g) return;
    setBusy(true);
    try {
      const s = await groupApi(g.code, body);
      setState(s);
      after?.(s);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function checkoutForEveryone() {
    if (!g) return;
    setBusy(true);
    try {
      const r = await groupApi<{ lines: Line[]; restaurant: { id: string; name: string; slug: string; currency: string } }>(g.code, { action: "lock" });
      setGroup({ ...g, mode: "checkout" });
      replaceWith(r.restaurant, r.lines);
      router.push("/checkout");
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  }

  async function reopen() {
    if (!g) return;
    await act({ action: "unlock" }, (s) => {
      const mine = s.members.find((m) => m.isMe)?.lines ?? [];
      setGroup({ ...g, mode: "open" });
      replaceWith({ id: s.restaurant.id, name: s.restaurant.name, slug: s.restaurant.slug, currency: s.restaurant.currency }, mine);
    });
  }

  const ended = state && (state.status === "ORDERED" || state.status === "CANCELED" || state.status === "EXPIRED");
  return (
    <section className="card mb-4 overflow-hidden" data-testid="group-panel">
      <div className="flex items-center gap-3 bg-brand-50 px-4 py-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
          <Users className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-extrabold leading-tight">{t("Group order")}</div>
          <div className="truncate text-xs text-ink-soft">
            {state ? `${g.isHost ? t("You're the host") : t("{host} places the order", { host: state.hostName })} · ${t(state.members.length === 1 ? "1 person" : "{n} people", { n: state.members.length })}` : t("Loading…")}
          </div>
        </div>
        {!ended && state?.status === "OPEN" && (
          <button type="button" onClick={() => setInvite(true)} className="chip h-9 shrink-0 text-xs font-bold" data-testid="group-invite">
            <UserPlus className="h-4 w-4" /> {t("Invite")}
          </button>
        )}
      </div>

      {error && !state && <p className="px-4 py-3 text-sm text-red-600">{error}</p>}

      {state?.status === "ORDERED" ? (
        <div className="space-y-3 p-4 text-center" data-testid="group-ordered">
          <div className="text-4xl">🎉</div>
          <p className="font-bold">{g.isHost ? t("Your group order was placed") : t("{host} placed the order for everyone", { host: state.hostName })}</p>
          <Button block onClick={() => done()}>{t("Done")}</Button>
        </div>
      ) : ended ? (
        <div className="space-y-3 p-4 text-center">
          <p className="font-bold">{t("This group order has ended")}</p>
          <Button block variant="outline" onClick={() => done(true)}>{t("OK")}</Button>
        </div>
      ) : (
        <>
          {state?.status === "LOCKED" && (
            <div className="flex items-start gap-2 border-b border-black/5 px-4 py-3 text-sm" data-testid="group-locked">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              <div className="min-w-0 flex-1">
                {g.isHost ? t("Friends can't change their items while you check out.") : t("{host} is placing the order now.", { host: state.hostName })}
                {g.isHost && (
                  <button type="button" onClick={reopen} disabled={busy} className="ms-1 font-bold text-brand-600" data-testid="group-reopen">
                    {t("Reopen for changes")}
                  </button>
                )}
              </div>
            </div>
          )}
          <ul className="divide-y divide-black/5">
            {others.map((m) => (
              <li key={m.id} className="px-4 py-3" data-testid="group-member">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">
                    {m.name}
                    {m.isHost && <span className="ms-1.5 text-xs font-semibold text-ink-muted">({t("host")})</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular text-sm font-bold">{formatMoney(total(m.lines), currency)}</span>
                    {g.isHost && state?.status === "OPEN" && (
                      <button type="button" onClick={() => confirm(t("Remove {name} from the group?", { name: m.name })) && act({ action: "remove", memberId: m.id })} className="grid h-7 w-7 place-items-center rounded-full text-ink-muted active:bg-black/5" aria-label={t("Remove")}>
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </span>
                </div>
                {m.lines.length ? (
                  <ul className="mt-1 space-y-0.5 text-sm text-ink-soft">
                    {m.lines.map((l, i) => (
                      <li key={i}>
                        {l.quantity}× {l.name}
                        {l.summary.length > 0 && <span className="text-xs text-ink-muted"> · {l.summary.join(", ")}</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-0.5 text-sm text-ink-muted">{t("Choosing…")}</p>
                )}
              </li>
            ))}
            {state && !others.length && <li className="px-4 py-3 text-sm text-ink-muted">{t("Nobody has joined yet. Tap Invite to share the link on WhatsApp.")}</li>}
          </ul>
          <div className="border-t border-black/5 px-4 py-3 text-sm">
            <div className="mb-1 font-bold">{t("Your items")}{me && !g.isHost ? ` (${me.name})` : ""}</div>
            <p className="text-ink-muted">{g.isHost ? t("Your own items are below. You'll pay for the whole order in cash.") : t("Add your meal from the menu: it's added to the group order automatically.")}</p>
            {state && state.status === "OPEN" && !cart?.lines.length && (
              <Link prefetch href={`/r/${state.restaurant.slug}`} className="mt-2 flex h-11 items-center justify-center rounded-xl bg-brand-600 font-bold text-white" data-testid="group-add-meal">
                {t("Add my meal from {name}", { name: state.restaurant.name })}
              </Link>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-black/5 px-4 py-3">
            <span className="text-sm font-semibold text-ink-soft">{t("Everyone's items")}</span>
            <span className="tabular font-extrabold" data-testid="group-total">{formatMoney(everyone, currency)}</span>
          </div>
          <div className="space-y-2 px-4 pb-4">
            {g.isHost ? (
              state?.status === "OPEN" && (
                <Button size="lg" block onClick={checkoutForEveryone} disabled={busy || !state} data-testid="group-checkout">
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null} {t("Checkout for everyone · {total}", { total: formatMoney(everyone, currency) })}
                </Button>
              )
            ) : (
              <p className="rounded-xl bg-black/5 p-3 text-center text-sm">{t("{host} will place the order and pay cash on delivery.", { host: state?.hostName ?? "" })}</p>
            )}
            <button
              type="button"
              className="w-full py-1 text-center text-xs font-semibold text-ink-muted"
              onClick={() => {
                if (g.isHost) {
                  if (confirm(t("Cancel this group order for everyone?"))) void act({ action: "cancel" }, () => done(true));
                } else if (confirm(t("Leave this group order? Your items will be removed."))) void act({ action: "leave" }, () => done());
              }}
              data-testid="group-leave"
            >
              {g.isHost ? t("Cancel group order") : t("Leave group order")}
            </button>
          </div>
        </>
      )}
      {invite && state && <ShareSheet open onClose={() => setInvite(false)} title={t("Invite friends")} message={inviteText(t, state.restaurant.name)} path={`/g/${state.code}`} />}
    </section>
  );
}

/** After the host places the order (checkout), the group is marked ordered for everyone. */
export function finishGroupAfterOrder(reference: string) {
  const g = getGroup();
  if (!g) return;
  if (g.isHost) void groupApi(g.code, { action: "ordered", reference }).catch(() => {});
  setGroup(null);
}
