import { TaskCardSkeleton } from "@/components/task-card";

export default function Loading() {
  return (
    <div className="space-y-6 sm:space-y-10" aria-busy="true" aria-label="Loading tasks">
      <div className="h-40 rounded-4xl bg-gradient-to-br from-brand-500/80 to-brand-700/80 sm:h-56" />
      <div className="h-7 w-40 rounded-full bg-lavender" />
      <div className="grid grid-cols-1 gap-3.5 sm:gap-5 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <TaskCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
