import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <LogoMark className="h-16 w-16 opacity-80" />
      <h1 className="mt-5 text-2xl font-extrabold">Nothing here</h1>
      <p className="mt-2 text-ink-muted">This page or task doesn’t exist, or it’s no longer available.</p>
      <Link href="/" className={`${buttonClass.primary} mt-7`}>
        See live tasks
      </Link>
    </div>
  );
}
