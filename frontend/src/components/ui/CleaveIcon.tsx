// frontend/src/components/ui/CleaveIcon.tsx
const BLUE = "#4AAED9";
const SEAFOAM = "#5EC6A1";
const LIME = "#A8D55C";
const GOLD = "#F2C94C";

export function CleaveIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="clvGrad" x1="0" y1="0" x2="32" y2="32">
          <stop offset="0%" stopColor={BLUE} />
          <stop offset="100%" stopColor={SEAFOAM} />
        </linearGradient>
        <linearGradient id="clvGrad2" x1="32" y1="0" x2="0" y2="32">
          <stop offset="0%" stopColor={SEAFOAM} />
          <stop offset="100%" stopColor={LIME} />
        </linearGradient>
      </defs>
      <path
        d="M6,28 C6,22 8,18 12,16 C8,14 6,10 6,4"
        stroke="url(#clvGrad)" strokeWidth="2.5" strokeLinecap="round" fill="none"
      />
      <path
        d="M26,28 C26,22 24,18 20,16 C24,14 26,10 26,4"
        stroke="url(#clvGrad2)" strokeWidth="2.5" strokeLinecap="round" fill="none"
      />
      <line x1="10" y1="9" x2="15" y2="9" stroke={BLUE} strokeWidth="1.3" strokeLinecap="round" opacity="0.6" />
      <line x1="17" y1="9" x2="22" y2="9" stroke={SEAFOAM} strokeWidth="1.3" strokeLinecap="round" opacity="0.6" />
      <line x1="12" y1="14" x2="15.5" y2="14" stroke={BLUE} strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />
      <line x1="16.5" y1="14" x2="20" y2="14" stroke={SEAFOAM} strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />
      <line x1="12" y1="19" x2="15.5" y2="19" stroke={LIME} strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />
      <line x1="16.5" y1="19" x2="20" y2="19" stroke={GOLD} strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />
      <line x1="10" y1="24" x2="15" y2="24" stroke={LIME} strokeWidth="1.3" strokeLinecap="round" opacity="0.6" />
      <line x1="17" y1="24" x2="22" y2="24" stroke={GOLD} strokeWidth="1.3" strokeLinecap="round" opacity="0.6" />
      <line x1="13" y1="11" x2="19" y2="22" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <circle cx="13" cy="11" r="1.5" fill="white" opacity="0.6" />
      <circle cx="19" cy="22" r="1.5" fill="white" opacity="0.6" />
    </svg>
  );
}
