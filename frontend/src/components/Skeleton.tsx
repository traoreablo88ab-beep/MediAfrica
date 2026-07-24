// Shared loading placeholder — a pulsing gray block sized via className.
// Compose it into table rows / cards / stat tiles per page rather than
// building one generic "skeleton table" component, since every page's
// column layout differs.
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-[#e1e0d9]/60 ${className}`} />;
}
