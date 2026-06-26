export function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-brand-text/8 ${className ?? ''}`} />;
}
