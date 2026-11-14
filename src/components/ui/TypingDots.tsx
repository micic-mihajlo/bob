export function TypingDots({ className }: { className?: string }) {
  return (
    <span className={className ?? "typing-dots"} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}
