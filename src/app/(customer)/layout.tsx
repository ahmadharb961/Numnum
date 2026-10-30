import { BottomNav } from "@/components/customer/bottom-nav";
import { ReviewPrompt } from "@/components/customer/review-prompt";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BottomNav />
      <ReviewPrompt />
    </>
  );
}
