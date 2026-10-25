export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      {/* A "u" whose right stem stops short — the wall with the gap in it. */}
      <path d="M5 4v9a7 7 0 0 0 7 7" />
      <path d="M19 8v5a7 7 0 0 1-7 7" />
    </svg>
  );
}
