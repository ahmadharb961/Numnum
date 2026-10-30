import { STACK_H, STACK_PATH, STACK_W } from "@/lib/logo";
import { cn } from "@/lib/utils";

/** The numnum logo ("num" over "num") in the current text color (text-brand-600, text-white…). Size it by height, e.g. className="h-10". */
export function Logo({ className, title = "numnum" }: { className?: string; title?: string }) {
  return (
    <svg viewBox={`0 0 ${STACK_W} ${STACK_H}`} className={cn("block w-auto shrink-0 fill-current", className)} role="img" aria-label={title}>
      <path d={STACK_PATH} />
    </svg>
  );
}
