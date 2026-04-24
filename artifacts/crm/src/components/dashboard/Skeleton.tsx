interface SkeletonProps {
  className?: string;
  rounded?: boolean;
}

export function Skeleton({ className = '', rounded = false }: SkeletonProps) {
  return (
    <div
      className={`shimmer ${rounded ? 'rounded-full' : 'rounded-lg'} ${className}`}
      style={{ minHeight: 16 }}
    />
  );
}

export function KPICardSkeleton() {
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-9" rounded />
      </div>
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-1 w-full rounded-full" />
    </div>
  );
}

export function CardSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6" style={{ minHeight: height }}>
      <div className="flex items-center gap-2 mb-4">
        <Skeleton className="h-5 w-5" rounded />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    </div>
  );
}
