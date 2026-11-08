"use client";

import { buttonClass } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <h1 className="text-2xl font-extrabold">Something went wrong</h1>
      <p className="mt-2 text-ink-muted">Please try again. If it keeps happening, refresh the page.</p>
      <button onClick={reset} className={`${buttonClass.primary} mt-7`}>
        Try again
      </button>
    </div>
  );
}
