export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse" aria-busy="true">
      <div className="mb-4 h-4 w-24 rounded-full bg-lavender" />
      <div className="space-y-6 rounded-4xl bg-white p-8 shadow-card ring-1 ring-ink/5">
        <div className="h-14 w-40 rounded-2xl bg-lavender" />
        <div className="h-8 w-3/4 rounded-full bg-lavender" />
        <div className="h-5 w-full rounded-full bg-lavender" />
        <div className="h-20 rounded-3xl bg-lavender" />
        <div className="h-14 rounded-full bg-whatsapp/30" />
      </div>
    </div>
  );
}
