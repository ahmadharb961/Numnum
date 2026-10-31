"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, X } from "lucide-react";
import { requestVerificationAction } from "@/actions/restaurant";
import { uploadFile } from "./upload";
import { Button } from "@/components/ui/button";
import { Alert, Field } from "@/components/ui/misc";
import { useT } from "@/i18n/client";

export function VerificationForm() {
  const t = useT();
  const [f, setF] = useState({ legalName: "", registration: "", contactName: "", contactRole: "", notes: "" });
  const [docs, setDocs] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await requestVerificationAction({ ...f, documentIds: docs.map((d) => d.id) });
        setBusy(false);
        setMsg({ ok: r.ok, text: r.ok ? r.message ?? "Submitted" : r.error });
        if (r.ok) router.refresh();
      }}
    >
      {msg && <Alert tone={msg.ok ? "green" : "red"}>{msg.text}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Legal business name">
          <input className="input" value={f.legalName} onChange={(e) => setF({ ...f, legalName: e.target.value })} required />
        </Field>
        <Field label="Commercial registration number">
          <input className="input" value={f.registration} onChange={(e) => setF({ ...f, registration: e.target.value })} />
        </Field>
        <Field label="Contact person">
          <input className="input" value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} required />
        </Field>
        <Field label="Role">
          <input className="input" value={f.contactRole} onChange={(e) => setF({ ...f, contactRole: e.target.value })} placeholder={t("Owner, manager…")} />
        </Field>
      </div>
      <Field label="Anything else? (optional)">
        <textarea className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </Field>
      <div>
        <div className="label">{t("Supporting documents")}</div>
        <p className="mb-2 text-xs text-ink-muted">{t("Commercial registration, municipality license, or a utility bill for the premises. PDF or photo, stored privately.")}</p>
        <div className="flex flex-wrap gap-2">
          {docs.map((d) => (
            <span key={d.id} className="chip h-9 text-xs">
              {d.name}
              <button type="button" onClick={() => setDocs(docs.filter((x) => x.id !== d.id))} aria-label={t("Remove")}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          <Button type="button" variant="outline" size="sm" loading={uploading} onClick={() => ref.current?.click()}>
            <Upload className="h-4 w-4" /> {t("Add document")}
          </Button>
        </div>
        <input
          ref={ref}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setUploading(true);
            try {
              const up = await uploadFile(file, "document");
              setDocs((d) => [...d, { id: up.id, name: file.name }]);
            } catch (err) {
              setMsg({ ok: false, text: (err as Error).message });
            } finally {
              setUploading(false);
            }
          }}
        />
      </div>
      <Button type="submit" loading={busy}>
        {t("Request verification")}
      </Button>
    </form>
  );
}
