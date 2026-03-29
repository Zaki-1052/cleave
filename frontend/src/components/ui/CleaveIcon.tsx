// frontend/src/components/ui/CleaveIcon.tsx

/**
 * Cleave brand icon — a DNA double helix being enzymatically cleaved.
 *
 * Design rationale:
 * - White backbone curves + rungs provide contrast on ANY colored background
 *   (gradient nav, dark scrolled nav, cards, etc.)
 * - Gold (#F2C94C) diagonal slash is the single color accent — draws the eye
 *   to the "cleave" action and evokes restriction enzyme / CUT&RUN cleavage.
 * - Hourglass silhouette (strands pinch at center, splay at ends) reads
 *   clearly even at 22px nav size.
 * - 3 broken rung pairs show the base-pair structure without cluttering
 *   at small sizes. Center gap on each rung = the enzymatic cut site.
 *
 * Works at: 16px (favicon-tiny), 22px (nav), 28px (nav hover), 32-64px (hero/marketing)
 */
export function CleaveIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-label="Cleave logo"
      role="img"
    >
      {/* Left backbone — white, high opacity for contrast on gradient bg */}
      <path
        d="M7,28 C7,21.5 9.5,18 13.5,16 C9.5,14 7,10.5 7,4"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
        opacity="0.92"
      />
      {/* Right backbone */}
      <path
        d="M25,28 C25,21.5 22.5,18 18.5,16 C22.5,14 25,10.5 25,4"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
        opacity="0.92"
      />

      {/* Base-pair rungs — 3 broken pairs, white, medium opacity */}
      {/* Top rung */}
      <line x1="8.5" y1="8.5" x2="14.5" y2="8.5" stroke="white" strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />
      <line x1="17.5" y1="8.5" x2="23.5" y2="8.5" stroke="white" strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />
      {/* Middle rung (at the pinch point) */}
      <line x1="11.5" y1="16" x2="14.8" y2="16" stroke="white" strokeWidth="1.3" strokeLinecap="round" opacity="0.45" />
      <line x1="17.2" y1="16" x2="20.5" y2="16" stroke="white" strokeWidth="1.3" strokeLinecap="round" opacity="0.45" />
      {/* Bottom rung */}
      <line x1="8.5" y1="23.5" x2="14.5" y2="23.5" stroke="white" strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />
      <line x1="17.5" y1="23.5" x2="23.5" y2="23.5" stroke="white" strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />

      {/* The cleave — gold diagonal slash through the center gap */}
      <line
        x1="13.8" y1="10.5"
        x2="18.2" y2="21.5"
        stroke="#F2C94C"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.9"
      />
      {/* Cut endpoint glow dots */}
      <circle cx="13.8" cy="10.5" r="2" fill="#F2C94C" opacity="0.75" />
      <circle cx="18.2" cy="21.5" r="2" fill="#F2C94C" opacity="0.75" />
    </svg>
  );
}
