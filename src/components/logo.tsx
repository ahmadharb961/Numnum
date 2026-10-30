import { NUM_H, NUM_PATH, NUM_W, ROW_W, STACK_H, STACK_PATH, STACK_W } from "@/lib/logo";
import { cn } from "@/lib/utils";

/**
 * The numnum wordmark in the current text color (set it with text-brand-600, text-white…).
 * "row" is numnum on one line for headers; "stack" is the two-line mark from the app icon.
 * Size it by height, e.g. className="h-6".
 */
export function Logo({ variant = "row", className, title = "numnum" }: { variant?: "row" | "stack"; className?: string; title?: string }) {
  const stack = variant === "stack";
  return (
    <svg viewBox={stack ? `0 0 ${STACK_W} ${STACK_H}` : `0 0 ${ROW_W} ${NUM_H}`} className={cn("block w-auto shrink-0 fill-current", className)} role="img" aria-label={title}>
      {stack ? (
        <path d={STACK_PATH} />
      ) : (
        <>
          <path d={NUM_PATH} />
          <path d={NUM_PATH} transform={`translate(${NUM_W + (ROW_W - 2 * NUM_W)} 0)`} />
        </>
      )}
    </svg>
  );
}
