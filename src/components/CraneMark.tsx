/**
 * The Hagane heron standing in water, drawn as an inline SVG: transparent background, no image file needed.
 * It paints with currentColor, so the caller picks the color (black in the red logo circle, light on the hero banner).
 * This is a redraw of the supplied logo1.png, not the original file.
 */
export function CraneMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 170 220"
      className={className}
      fill="currentColor"
      stroke="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {/* beak and head */}
      <path d="M97 21 L162 36 L99 33 Z" stroke="none" />
      <ellipse cx="96" cy="27" rx="10" ry="8" stroke="none" />
      {/* crest plume trailing behind the head */}
      <path d="M90 22 C78 16 64 19 55 29" fill="none" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M90 28 C79 27 68 31 60 40" fill="none" strokeWidth="2.2" strokeLinecap="round" />
      {/* S-curved neck */}
      <path d="M99 33 C91 50 112 62 99 82" fill="none" strokeWidth="7.5" strokeLinecap="round" />
      {/* body with the tail sweeping down to the left */}
      <path d="M99 76 C70 78 44 100 36 140 C54 128 69 132 83 152 C102 136 112 104 109 80 Z" stroke="none" />
      {/* legs */}
      <path d="M79 148 L73 190 M88 146 L87 190" fill="none" strokeWidth="3" strokeLinecap="round" />
      {/* ripples */}
      <ellipse cx="82" cy="194" rx="70" ry="12" fill="none" strokeWidth="2" />
      <ellipse cx="82" cy="194" rx="46" ry="7.5" fill="none" strokeWidth="2" />
      <ellipse cx="82" cy="194" rx="24" ry="4" fill="none" strokeWidth="2" />
    </svg>
  )
}
