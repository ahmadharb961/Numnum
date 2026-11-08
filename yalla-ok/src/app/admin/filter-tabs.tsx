import Link from "next/link";

export function FilterTabs({
  base,
  current,
  options,
  extra = "",
}: {
  base: string;
  current: string;
  options: readonly (readonly [string, string])[];
  extra?: string;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex w-max gap-1.5">
        {options.map(([value, label]) => (
          <Link
            key={value}
            href={`${base}?status=${value}${extra}`}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
              current === value ? "bg-ink text-white" : "bg-lavender text-ink-soft hover:text-ink"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
