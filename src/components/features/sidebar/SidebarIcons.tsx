/** The sidebar's own SVGs, on the reference's 20-unit grid. */

export function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="ui-glyph-20 size-4 fill-none stroke-current">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="m12.7 12.7 3.6 3.6" strokeLinecap="round" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="ui-glyph-20 size-[18px] fill-none stroke-current">
      <path d="M10 4v12M4 10h12" strokeLinecap="round" />
    </svg>
  );
}

export function SidebarToggleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="sidebar-toggle-icon ui-glyph-20">
      <rect x="2.75" y="3.25" width="14.5" height="13.5" rx="2.25" />
      <path d="M7.25 3.75v12.5" />
    </svg>
  );
}
