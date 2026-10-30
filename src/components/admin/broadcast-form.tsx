"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, Send, X } from "lucide-react";
import { sendBroadcastAction } from "@/actions/admin";
import { uploadFile } from "@/components/dashboard/upload";
import { Button } from "@/components/ui/button";
import { Alert, Field } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

type Audience = "everyone" | "customers" | "restaurants" | "user" | "restaurant";
type Stat = { people: number; devices: number };

const AUDIENCES: { key: Audience; label: string }[] = [
  { key: "everyone", label: "Everyone" },
  { key: "customers", label: "All customers" },
  { key: "restaurants", label: "All restaurants" },
  { key: "user", label: "One person" },
  { key: "restaurant", label: "One restaurant" },
];

export function BroadcastForm({ stats, restaurants }: { stats: Record<"everyone" | "customers" | "restaurants", Stat>; restaurants: { id: string; name: string }[] }) {
  const [audience, setAudience] = useState<Audience>("everyone");
  const [email, setEmail] = useState("");
  const [restaurantId, setRestaurantId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [link, setLink] = useState("");
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const stat = audience in stats ? stats[audience as keyof typeof stats] : null;

  const send = () => {
    setResult(null);
    const who = AUDIENCES.find((a) => a.key === audience)!.label.toLowerCase();
    if (stat && !window.confirm(`Send this notification to ${stat.people} ${stat.people === 1 ? "person" : "people"} (${who})?`)) return;
    start(async () => {
      const r = await sendBroadcastAction({ audience, email, restaurantId, title, body, imageUrl, link });
      if (r.ok) {
        setErrors({});
        setResult({ tone: "green", text: `Sent to ${r.people} ${r.people === 1 ? "person" : "people"} · delivered to ${r.delivered} of ${r.devices} device${r.devices === 1 ? "" : "s"}.` });
      } else {
        setErrors(r.fieldErrors ?? {});
        if (r.error) setResult({ tone: "red", text: r.error });
      }
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="card space-y-5 p-5">
        <div>
          <div className="label">Send to</div>
          <div className="flex flex-wrap gap-2">
            {AUDIENCES.map((a) => {
              const s = a.key in stats ? stats[a.key as keyof typeof stats] : null;
              return (
                <button key={a.key} type="button" onClick={() => setAudience(a.key)} className={cn("chip h-auto flex-col items-start gap-0 py-2", audience === a.key && "chip-active")}>
                  <span>{a.label}</span>
                  {s && <span className={cn("text-[11px] font-normal", audience === a.key ? "text-white/70" : "text-ink-muted")}>{s.people} with notifications on</span>}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-ink-muted">Only people who turned on notifications on a device can receive them.</p>
        </div>

        {audience === "user" && (
          <Field label="Their account email" error={errors.email} htmlFor="bc-email">
            <input id="bc-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </Field>
        )}
        {audience === "restaurant" && (
          <Field label="Restaurant" error={errors.restaurantId} hint="Goes to the restaurant's owner and staff." htmlFor="bc-restaurant">
            <select id="bc-restaurant" className="input" value={restaurantId} onChange={(e) => setRestaurantId(e.target.value)}>
              <option value="">Choose a restaurant…</option>
              {restaurants.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Title (optional)" error={errors.title} htmlFor="bc-title">
          <input id="bc-title" className="input" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="🔥 Weekend offer" />
        </Field>
        <Field label="Message (optional)" htmlFor="bc-body">
          <textarea id="bc-body" className="input" maxLength={300} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Free delivery from Burger House until Sunday." />
        </Field>

        <div>
          <div className="label">Photo (optional)</div>
          {imageUrl ? (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="" className="h-28 rounded-xl object-cover" />
              <button type="button" onClick={() => setImageUrl("")} className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-ink text-white" aria-label="Remove photo">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Button type="button" variant="outline" loading={uploading} onClick={() => fileRef.current?.click()}>
              <ImagePlus className="h-4 w-4" /> Upload photo
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setUploading(true);
              try {
                const up = await uploadFile(f, "image", { params: { scope: "platform" } });
                setImageUrl(up.url ?? "");
              } catch (err) {
                setResult({ tone: "red", text: (err as Error).message });
              } finally {
                setUploading(false);
              }
            }}
          />
          <p className="mt-1 text-xs text-ink-muted">Shown large on Android and computers. iPhones show the title and message only.</p>
        </div>

        <Field label="Link when tapped (optional)" error={errors.link} hint="A page like /restaurants or /r/burger-house, or a full https:// link. Empty opens the home page." htmlFor="bc-link">
          <input id="bc-link" className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="/r/burger-house" />
        </Field>

        {result && <Alert tone={result.tone}>{result.text}</Alert>}
        <Button type="button" size="lg" loading={pending} onClick={send}>
          <Send className="h-4 w-4" /> Send notification
        </Button>
      </div>

      <div>
        <div className="label">Preview</div>
        <div className="rounded-2xl bg-white/90 p-3 shadow-lg ring-1 ring-black/5">
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="" className="h-9 w-9 rounded-lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between text-[11px] text-ink-muted">
                <span className="font-semibold uppercase tracking-wide">numnum</span>
                <span>now</span>
              </div>
              <div className="truncate text-sm font-bold">{title || "numnum"}</div>
              {body && <div className="line-clamp-3 text-sm text-ink-soft">{body}</div>}
            </div>
          </div>
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="mt-2 max-h-48 w-full rounded-xl object-cover" />
          )}
        </div>
        <p className="mt-2 text-xs text-ink-muted">It stays on the screen until tapped, then opens {link ? <b>{link}</b> : "the home page"}.</p>
      </div>
    </div>
  );
}
