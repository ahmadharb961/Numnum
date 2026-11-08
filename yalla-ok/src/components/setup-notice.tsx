import { LogoMark } from "@/components/logo";

export function SetupNotice() {
  return (
    <div className="mx-auto max-w-xl rounded-4xl bg-lavender p-8 text-center">
      <LogoMark className="mx-auto h-14 w-14" />
      <h1 className="mt-4 text-2xl font-extrabold">Almost there</h1>
      <p className="mt-2 text-ink-soft">
        Yalla Ok needs a Supabase project. Copy <code className="rounded bg-white px-1.5 py-0.5">.env.example</code> to{" "}
        <code className="rounded bg-white px-1.5 py-0.5">.env.local</code>, fill in your Supabase URL and keys, run the migration in{" "}
        <code className="rounded bg-white px-1.5 py-0.5">supabase/migrations</code>, then restart the server.
      </p>
    </div>
  );
}
