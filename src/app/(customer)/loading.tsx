import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="container-app space-y-3 pt-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-28" />
      <Skeleton className="h-28" />
      <Skeleton className="h-28" />
    </div>
  );
}
