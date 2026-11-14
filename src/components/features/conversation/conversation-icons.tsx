/** The reference conversation's own glyphs, on its 20-unit grid. Lucide icons come from lucide-react. */

export function CopyGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="ui-glyph-20">
      <rect x="6.5" y="6.5" width="9" height="9" rx="1.5" />
      <path d="M13 6.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v6.5A1.5 1.5 0 0 0 5 13h1.5" />
    </svg>
  );
}

export function StopIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="ui-glyph-20 size-[14px] fill-current">
      <rect x="6" y="6" width="8" height="8" rx="1.5" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="ui-glyph-20 size-[14px] fill-none stroke-current">
      <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
    </svg>
  );
}
