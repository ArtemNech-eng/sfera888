export function SkeletonCard({ title }: { title: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-[#E5E7EB] h-full">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-[18px] h-[18px] rounded-full bg-[#E5E7EB] animate-pulse" />
        <div className="h-4 w-32 bg-[#E5E7EB] rounded animate-pulse" />
      </div>
      <div className="space-y-3">
        <div className="h-8 bg-[#E5E7EB] rounded-lg animate-pulse" />
        <div className="h-8 bg-[#E5E7EB] rounded-lg animate-pulse w-[85%]" />
        <div className="h-8 bg-[#E5E7EB] rounded-lg animate-pulse w-[60%]" />
      </div>
    </div>
  );
}
