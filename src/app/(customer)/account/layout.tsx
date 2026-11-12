import { FreshOnNavigate } from "@/components/fresh-on-navigate";

// Account pages (orders, addresses…) always show the latest data, even when opened from the cache.
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FreshOnNavigate />
      {children}
    </>
  );
}
