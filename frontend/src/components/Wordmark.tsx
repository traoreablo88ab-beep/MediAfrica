// "MediAfrica" brand text — matches the horizontal logo asset
// (logo-horizontal-fond-clair.svg): Source Serif 4, weight 600, tight
// tracking. Always paired with <Logo /> so the two never drift apart.
const SIZE_CLASSES = {
  sm: 'text-sm',
  lg: 'text-lg',
} as const;

export function Wordmark({
  size = 'lg',
  className = '',
}: {
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}) {
  return (
    <span
      className={`font-[family-name:var(--font-source-serif-4)] font-semibold tracking-tight ${SIZE_CLASSES[size]} ${className}`}
    >
      MediAfrica
    </span>
  );
}
