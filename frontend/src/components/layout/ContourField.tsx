// frontend/src/components/layout/ContourField.tsx — topographic contour motif for
// identity moments (auth, landing hero, docs landing). Strokes inherit currentColor;
// parents set color + opacity, e.g. className="text-primary/[0.06]".
export function ContourField({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 800 600"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {/* Peak one — upper right */}
      <path d="M590 120 C610 105 650 110 660 135 C670 160 640 180 610 172 C585 165 575 138 590 120 Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M565 105 C600 80 675 90 692 140 C705 185 655 215 605 202 C560 190 542 135 565 105 Z" stroke="currentColor" strokeWidth="1.25" />
      <path d="M540 88 C590 50 705 65 728 145 C745 210 672 252 598 235 C532 219 505 130 540 88 Z" stroke="currentColor" strokeWidth="1" />
      <path d="M512 70 C580 18 738 40 765 150 C785 240 690 292 590 270 C500 250 468 122 512 70 Z" stroke="currentColor" strokeWidth="1" />
      <path d="M482 52 C575 -18 772 12 800 165 L800 250 C760 320 675 330 578 305 C462 276 428 112 482 52 Z" stroke="currentColor" strokeWidth="0.75" />
      {/* Peak two — lower left */}
      <path d="M135 415 C150 400 185 405 192 428 C198 450 172 466 148 458 C128 452 122 428 135 415 Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M110 395 C140 368 210 378 224 425 C235 465 192 494 140 482 C96 472 82 420 110 395 Z" stroke="currentColor" strokeWidth="1.25" />
      <path d="M82 372 C128 330 240 345 260 420 C276 483 215 525 132 508 C60 494 40 410 82 372 Z" stroke="currentColor" strokeWidth="1" />
      <path d="M52 348 C112 288 272 306 298 415 C318 500 235 552 122 532 C22 514 -4 404 52 348 Z" stroke="currentColor" strokeWidth="0.75" />
      {/* Slope lines */}
      <path d="M0 300 C120 280 260 320 400 300 C540 280 660 320 800 290" stroke="currentColor" strokeWidth="0.75" />
      <path d="M0 350 C130 325 270 370 410 348 C550 326 670 368 800 340" stroke="currentColor" strokeWidth="0.75" />
    </svg>
  );
}
