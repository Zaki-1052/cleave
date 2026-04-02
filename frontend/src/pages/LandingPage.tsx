// frontend/src/pages/LandingPage.tsx
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { CleaveIcon } from "@/components/ui/CleaveIcon";

/* ─────────────── palette ─────────────── */
const C = {
  blue: "#4AAED9",
  seafoam: "#5EC6A1",
  lime: "#A8D55C",
  gold: "#F2C94C",
  coral: "#E8845C",
  lavender: "#A78BFA",
  deep: "#0B1120",
  card: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.08)",
};

/* ─────────────── data (v1 text) ─────────────── */
const PIPELINE_STEPS = [
  { label: "FASTQ Upload", icon: "↑", desc: "Resumable tus uploads or direct FTP/SFTP import", color: C.blue },
  { label: "FastQC", icon: "✓", desc: "Automated quality assessment", color: C.seafoam },
  { label: "Trimming", icon: "✂", desc: "Parallel Trimmomatic + kseq_test (42bp)", color: C.lime },
  { label: "Alignment", icon: "⇶", desc: "Parallel Bowtie2 → SAMtools → Picard → deepTools", color: C.gold },
  { label: "Peak Calling", icon: "▲", desc: "Parallel MACS2 / SICER2 / SEACR with HOMER", color: C.coral },
  { label: "Visualization", icon: "◎", desc: "IGV.js genome browser + heatmaps", color: C.lavender },
];

const FEATURES = [
  {
    title: "Three Peak Callers",
    desc: "MACS2 narrow & broad, SICER2 for broad domains, and SEACR for sparse enrichment — all with fragment size filtering, FRiP scoring, and HOMER annotation.",
    color: C.blue,
    tags: ["MACS2", "SICER2", "SEACR", "HOMER"],
  },
  {
    title: "DiffBind Differential Analysis",
    desc: "Interactive sample sheet builder, three analysis modes, MA/volcano/PCA/heatmap plots with dynamic column detection from dba.report().",
    color: C.seafoam,
    tags: ["DiffBind", "DESeq2", "Differential Peaks"],
  },
  {
    title: "IGV.js Genome Browser",
    desc: "Embedded genome browser with lazy-loaded bigWig tracks, byte-range serving via NGINX, and reaction-based track selection.",
    color: C.lime,
    tags: ["IGV.js", "bigWig", "BAM"],
  },
  {
    title: "Custom Heatmaps & Correlation",
    desc: "Reference-point heatmaps from user-provided BED files and Pearson correlation matrices for replicate QC — powered by deepTools.",
    color: C.gold,
    tags: ["deepTools", "Heatmaps", "Pearson"],
  },
  {
    title: "Roman Normalization",
    desc: "Sample-to-sample normalization for mouse (mm10) with 99th-percentile quantile masking — essential for comparing across conditions.",
    color: C.coral,
    tags: ["Quantile", "mm10", "Normalization"],
  },
  {
    title: "Auto-Generated Methods",
    desc: "Every analysis job produces copy-paste-ready methods text with exact tool versions and parameters — ready for your manuscript.",
    color: C.blue,
    tags: ["Reproducibility", "Manuscripts"],
  },
];

const COMPARISON = [
  { feature: "FASTQ Upload + FastQC", cutana: true, cleave: true },
  { feature: "Bowtie2 Alignment + QC", cutana: true, cleave: true },
  { feature: "MACS2 Narrow Peaks", cutana: true, cleave: true },
  { feature: "SICER2 Broad Peaks", cutana: true, cleave: true },
  { feature: "IgG Control Background Subtraction", cutana: true, cleave: true },
  { feature: "E. coli Spike-in Normalization", cutana: true, cleave: true },
  { feature: "SNAP-CUTANA Spike-in QC", cutana: true, cleave: true },
  { feature: "IGV.js Genome Browser", cutana: true, cleave: true },
  { feature: "Auto-Generated Methods Text", cutana: true, cleave: true },
  { feature: "FTP / SFTP Server Import", cutana: true, cleave: true },
  { feature: "SEACR Peak Calling", cutana: false, cleave: true },
  { feature: "MACS2 Broad Mode", cutana: false, cleave: true },
  { feature: "FASTQ Trimming", cutana: false, cleave: true },
  { feature: "Fragment Size Filter (<120bp)", cutana: false, cleave: true },
  { feature: "DiffBind Differential Analysis", cutana: false, cleave: true },
  { feature: "Custom Reference-Point Heatmaps", cutana: false, cleave: true },
  { feature: "Pearson Correlation Matrices", cutana: false, cleave: true },
  { feature: "Roman Normalization", cutana: false, cleave: true },
  { feature: "Parallel Pipeline Processing", cutana: false, cleave: true },
  { feature: "Training Mode (First-Time Users)", cutana: false, cleave: true },
];

const STATS = [
  { value: 500, label: "Backend Tests Passing" },
  { value: 20, label: "Pipeline Capabilities" },
  { value: 10, label: "New vs CUTANA Cloud" },
  { value: 12, label: "Implementation Phases" },
];

/* ─────────────── font shorthands ─────────────── */
const serif = '"Source Serif 4", Georgia, serif';
const mono = '"Source Code Pro", monospace';
const sans = '"Source Sans 3", system-ui, sans-serif';

/* ─────────────── hooks ─────────────── */
function useInView(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) { setVis(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, vis };
}

function useMouseParallax(intensity = 0.02) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      setOffset({ x: (e.clientX - cx) * intensity, y: (e.clientY - cy) * intensity });
    };
    window.addEventListener("mousemove", handler, { passive: true });
    return () => window.removeEventListener("mousemove", handler);
  }, [intensity]);
  return offset;
}

function useCountUp(target: number, active: boolean, duration = 1800) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) return;
    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setVal(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [active, target, duration]);
  return val;
}

/* ─────────────── primitives ─────────────── */
function Blob({ color, size, blur, opacity, className, style }: {
  color: string; size: number; blur: number; opacity: number;
  className?: string; style?: React.CSSProperties;
}) {
  return (
    <div
      className={`absolute rounded-full pointer-events-none ${className ?? ""}`}
      style={{
        width: size, height: size,
        background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
        filter: `blur(${blur}px)`, opacity, ...style,
      }}
    />
  );
}

function Reveal({ children, className, delay = 0, direction = "up" }: {
  children: React.ReactNode; className?: string; delay?: number;
  direction?: "up" | "left" | "right" | "scale";
}) {
  const { ref, vis } = useInView(0.08);
  const transforms: Record<string, string> = {
    up: "translateY(44px)", left: "translateX(-36px)",
    right: "translateX(36px)", scale: "scale(0.94)",
  };
  return (
    <div
      ref={ref}
      className={`transition-all duration-[900ms] ease-out ${className ?? ""}`}
      style={{
        opacity: vis ? 1 : 0,
        transform: vis ? "none" : transforms[direction],
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/* CleaveIcon imported from @/components/ui/CleaveIcon */

/* ─────────────── decorative SVGs (v2 upgraded versions) ─────────────── */
function ChromatinWave({ flip }: { flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 1440 260"
      className={`w-full block ${flip ? "rotate-180" : ""}`}
      preserveAspectRatio="none"
      style={{ height: 120 }}
    >
      <defs>
        <linearGradient id="wg" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={C.blue} stopOpacity="0.25" />
          <stop offset="40%" stopColor={C.seafoam} stopOpacity="0.2" />
          <stop offset="70%" stopColor={C.lime} stopOpacity="0.15" />
          <stop offset="100%" stopColor={C.gold} stopOpacity="0.1" />
        </linearGradient>
      </defs>
      <path fill="url(#wg)">
        <animate attributeName="d" dur="14s" repeatCount="indefinite"
          values="M0,130 C180,60 360,200 540,130 C720,60 900,200 1080,130 C1260,70 1380,170 1440,130 L1440,260 L0,260Z;M0,150 C180,100 360,170 540,120 C720,80 900,190 1080,150 C1260,100 1380,150 1440,120 L1440,260 L0,260Z;M0,130 C180,60 360,200 540,130 C720,60 900,200 1080,130 C1260,70 1380,170 1440,130 L1440,260 L0,260Z" />
      </path>
      <path fill="url(#wg)" opacity="0.4">
        <animate attributeName="d" dur="18s" repeatCount="indefinite"
          values="M0,170 C240,110 480,220 720,170 C960,120 1200,220 1440,170 L1440,260 L0,260Z;M0,190 C240,150 480,200 720,160 C960,130 1200,200 1440,190 L1440,260 L0,260Z;M0,170 C240,110 480,220 720,170 C960,120 1200,220 1440,170 L1440,260 L0,260Z" />
      </path>
    </svg>
  );
}

function DNAHelix({ height = 480 }: { height?: number }) {
  const n = 16;
  const cx = 50;
  return (
    <svg width="100" viewBox={`0 0 100 ${height}`} className="opacity-[0.15]">
      {Array.from({ length: n }).map((_, i) => {
        const y = (i / (n - 1)) * (height - 30) + 15;
        const p = (i / n) * Math.PI * 2;
        const x1 = cx + Math.sin(p) * 28;
        const x2 = cx - Math.sin(p) * 28;
        const c = [C.blue, C.seafoam, C.lime, C.gold][i % 4];
        return (
          <g key={i}>
            <line x1={x1} y1={y} x2={x2} y2={y} stroke={c} strokeWidth="1.2" opacity="0.4" />
            <circle cx={x1} cy={y} r="3" fill={c} />
            <circle cx={x2} cy={y} r="3" fill={c} opacity="0.5" />
          </g>
        );
      })}
      <path d={Array.from({ length: n }).map((_, i) => {
        const y = (i / (n - 1)) * (height - 30) + 15;
        const x = cx + Math.sin((i / n) * Math.PI * 2) * 28;
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      }).join(" ")} fill="none" stroke={C.blue} strokeWidth="1.2" opacity="0.3" />
      <path d={Array.from({ length: n }).map((_, i) => {
        const y = (i / (n - 1)) * (height - 30) + 15;
        const x = cx - Math.sin((i / n) * Math.PI * 2) * 28;
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      }).join(" ")} fill="none" stroke={C.seafoam} strokeWidth="1.2" opacity="0.3" />
    </svg>
  );
}

function PeakLandscape() {
  return (
    <svg viewBox="0 0 900 140" className="w-full" preserveAspectRatio="none" style={{ height: 100 }}>
      <defs>
        <linearGradient id="pk1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.blue} stopOpacity="0.55" />
          <stop offset="100%" stopColor={C.blue} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="pk2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.seafoam} stopOpacity="0.3" />
          <stop offset="100%" stopColor={C.seafoam} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0,140 L0,115 C60,112 120,108 180,105 C240,100 300,110 360,112 C420,114 480,108 540,105 C600,102 660,110 720,112 C780,113 840,110 900,112 L900,140Z" fill="url(#pk2)" />
      <path d="M0,140 L0,110 C30,108 60,100 90,85 C110,72 125,45 140,30 C150,22 160,18 170,20 C185,25 200,50 230,78 C260,100 300,110 350,112 C380,113 410,108 430,95 C450,78 460,50 475,32 C485,22 495,18 510,16 C525,14 540,22 555,38 C570,55 590,85 630,105 C660,112 700,115 740,110 C760,106 775,80 790,58 C800,44 810,34 820,32 C835,30 850,42 870,68 C885,88 900,108 900,110 L900,140Z" fill="url(#pk1)" />
      <path d="M0,110 C30,108 60,100 90,85 C110,72 125,45 140,30 C150,22 160,18 170,20 C185,25 200,50 230,78 C260,100 300,110 350,112 C380,113 410,108 430,95 C450,78 460,50 475,32 C485,22 495,18 510,16 C525,14 540,22 555,38 C570,55 590,85 630,105 C660,112 700,115 740,110 C760,106 775,80 790,58 C800,44 810,34 820,32 C835,30 850,42 870,68 C885,88 900,108 900,110" fill="none" stroke={C.blue} strokeWidth="1.8" opacity="0.7" />
      {([[140, 30], [475, 32], [510, 16], [790, 58]] as const).map(([x, y], i) => (
        <g key={i}>
          <line x1={x} y1={y} x2={x} y2={y - 12} stroke={C.gold} strokeWidth="0.8" opacity="0.5" strokeDasharray="2,2" />
          <circle cx={x} cy={y - 14} r="2" fill={C.gold} opacity="0.5" />
        </g>
      ))}
    </svg>
  );
}

function GenomeRuler() {
  const ticks = 20;
  return (
    <div className="w-full overflow-hidden" style={{ height: 28 }}>
      <svg viewBox="0 0 1000 28" className="w-full" preserveAspectRatio="none">
        <line x1="0" y1="14" x2="1000" y2="14" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        {Array.from({ length: ticks + 1 }).map((_, i) => {
          const x = (i / ticks) * 1000;
          const major = i % 5 === 0;
          return (
            <g key={i}>
              <line x1={x} y1={major ? 6 : 10} x2={x} y2={14} stroke="rgba(255,255,255,0.08)" strokeWidth={major ? "1" : "0.5"} />
              {major && <text x={x} y={24} textAnchor="middle" fill="rgba(255,255,255,0.12)" fontSize="7" fontFamily="'Source Code Pro', monospace">{`${(i / ticks * 200).toFixed(0)} Mb`}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Particles() {
  const pts = useRef(
    Array.from({ length: 35 }).map((_, i) => ({
      x: Math.random() * 100, y: Math.random() * 100,
      s: Math.random() * 2.5 + 0.8, d: Math.random() * 22 + 14,
      dl: Math.random() * -20, c: [C.blue, C.seafoam, C.lime, C.gold, C.coral][i % 5],
      o: Math.random() * 0.12 + 0.04,
    }))
  ).current;
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {pts.map((p, i) => (
        <div key={i} className="absolute rounded-full" style={{
          left: `${p.x}%`, top: `${p.y}%`, width: p.s, height: p.s,
          background: p.c, opacity: p.o,
          animation: `floatP ${p.d}s ease-in-out ${p.dl}s infinite`,
        }} />
      ))}
    </div>
  );
}

function NoiseSVG() {
  return (
    <svg className="fixed inset-0 w-full h-full pointer-events-none z-[60] opacity-[0.025]" style={{ mixBlendMode: "overlay" }}>
      <filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" /></filter>
      <rect width="100%" height="100%" filter="url(#noise)" />
    </svg>
  );
}

function StatCounter({ stat, active, delay }: { stat: typeof STATS[number]; active: boolean; delay: number }) {
  const val = useCountUp(stat.value, active, 1600 + delay * 200);
  return (
    <div className="text-center">
      <div className="text-3xl sm:text-4xl font-bold tabular-nums" style={{ fontFamily: serif, color: C.blue }}>{val}</div>
      <div className="text-xs text-white/30 mt-1" style={{ fontFamily: mono }}>{stat.label}</div>
    </div>
  );
}

function ArchDiagram() {
  const boxes = [
    { label: "React SPA", x: 30, y: 20, w: 120, h: 36, color: C.blue },
    { label: "NGINX", x: 210, y: 20, w: 100, h: 36, color: C.seafoam },
    { label: "FastAPI", x: 370, y: 20, w: 110, h: 36, color: C.lime },
    { label: "PostgreSQL", x: 540, y: 20, w: 120, h: 36, color: C.gold },
    { label: "Worker", x: 370, y: 90, w: 110, h: 36, color: C.coral },
    { label: "Pipeline", x: 540, y: 90, w: 120, h: 36, color: C.lavender },
    { label: "/data/", x: 540, y: 155, w: 120, h: 32, color: C.gold },
  ];
  const arrows: [number, number, number, number][] = [
    [150, 38, 210, 38], [310, 38, 370, 38], [480, 38, 540, 38],
    [425, 56, 425, 90], [480, 108, 540, 108], [600, 126, 600, 155],
  ];
  return (
    <svg viewBox="0 0 700 200" className="w-full" style={{ maxWidth: 650, height: "auto" }}>
      {arrows.map(([x1, y1, x2, y2], i) => (
        <g key={`a${i}`}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.12)" strokeWidth="1.2" />
          <polygon points={x1 === x2 ? `${x2-3},${y2-5} ${x2+3},${y2-5} ${x2},${y2}` : `${x2-5},${y2-3} ${x2-5},${y2+3} ${x2},${y2}`} fill="rgba(255,255,255,0.15)" />
        </g>
      ))}
      <text x={435} y={76} textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="7" fontFamily="'Source Code Pro', monospace">SSE ↕</text>
      {boxes.map(b => (
        <g key={b.label}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="8" fill={`${b.color}10`} stroke={`${b.color}30`} strokeWidth="1" />
          <text x={b.x + b.w/2} y={b.y + b.h/2 + 4} textAnchor="middle" fill={b.color} fontSize="10" fontFamily="'Source Code Pro', monospace" fontWeight="500">{b.label}</text>
        </g>
      ))}
    </svg>
  );
}

/* ─────────────── main ─────────────── */
export default function LandingPage() {
  const [scrollY, setScrollY] = useState(0);
  const mouse = useMouseParallax(0.015);
  const statsRef = useRef<HTMLDivElement>(null);
  const [statsVis, setStatsVis] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) { setStatsVis(true); obs.disconnect(); }
    }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      className="min-h-screen text-white antialiased overflow-x-hidden"
      style={{ fontFamily: sans, background: `linear-gradient(170deg, ${C.deep} 0%, #0F1A2E 35%, #0D1F2D 65%, #0B1120 100%)` }}
    >
      <NoiseSVG />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Code+Pro:wght@400;500&family=Source+Sans+3:wght@400;500;600&family=Source+Serif+4:wght@600;700&display=swap');
        @keyframes floatP { 0%,100%{transform:translate(0,0)} 25%{transform:translate(10px,-20px)} 50%{transform:translate(-6px,-32px)} 75%{transform:translate(12px,-10px)} }
        @keyframes subtlePulse { 0%,100%{opacity:.55} 50%{opacity:1} }
        html { scroll-behavior: smooth }
        ::selection { background: ${C.blue}40; color: #fff }
      `}</style>

      {/* ═══ NAV ═══ */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{
          background: scrollY > 60 ? "rgba(11,17,32,0.88)" : "transparent",
          backdropFilter: scrollY > 60 ? "blur(18px) saturate(1.5)" : "none",
          borderBottom: scrollY > 60 ? `1px solid ${C.border}` : "1px solid transparent",
        }}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="#" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
              style={{ background: `linear-gradient(135deg, ${C.blue}, ${C.seafoam})` }}>
              <CleaveIcon size={22} />
            </div>
            <span className="text-xl tracking-tight font-bold" style={{ fontFamily: serif }}>Cleave</span>
          </a>
          <div className="hidden sm:flex items-center gap-8 text-[15px] font-medium text-white/60">
            {[["Pipeline","#pipeline"],["Features","#features"],["Compare","#compare"],["Architecture","#architecture"]].map(([label, href]) => (
              <a key={label} href={href}
                className="hover:text-white transition-colors duration-200 relative after:absolute after:bottom-[-2px] after:left-0 after:w-0 after:h-px after:bg-white/40 after:transition-all hover:after:w-full">
                {label}
              </a>
            ))}
            <Link to="/docs"
              className="hover:text-white transition-colors duration-200 relative after:absolute after:bottom-[-2px] after:left-0 after:w-0 after:h-px after:bg-white/40 after:transition-all hover:after:w-full">
              Docs
            </Link>
            <a href="https://github.com/Zaki-1052/cleave" target="_blank" rel="noopener noreferrer"
              className="hover:text-white transition-colors duration-200" aria-label="GitHub Repository">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
            </a>
            <Link to="/dashboard"
              className="ml-2 inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-semibold text-white transition-all duration-300 hover:scale-[1.03] hover:shadow-lg"
              style={{ background: `linear-gradient(135deg, ${C.blue}, ${C.seafoam})`, boxShadow: `0 2px 12px ${C.blue}25` }}>
              Launch Dashboard
            </Link>
          </div>
        </div>
      </nav>
      <div className="hidden lg:block absolute top-[52px] left-[5%] right-[5%] h-px z-10"
        style={{ background: `linear-gradient(90deg, ${C.blue}20, ${C.seafoam}20, ${C.lime}20, ${C.gold}20, ${C.coral}20, ${C.lavender}20)` }} />

      {/* ═══ HERO ═══ */}
      <section className="relative min-h-[100vh] flex flex-col items-center justify-center px-6 overflow-hidden">
        <Particles />
        <Blob color={C.blue} size={650} blur={130} opacity={0.11} className="top-[-120px] left-[-220px]"
          style={{ transform: `translate(${mouse.x*1.2}px, ${mouse.y*1.2}px)` }} />
        <Blob color={C.seafoam} size={500} blur={110} opacity={0.09} className="top-[18%] right-[-170px]"
          style={{ transform: `translate(${mouse.x*-0.8}px, ${mouse.y*-0.8}px)` }} />
        <Blob color={C.gold} size={480} blur={110} opacity={0.07} className="bottom-[8%] left-[8%]"
          style={{ transform: `translate(${mouse.x*0.6}px, ${mouse.y*0.6}px)` }} />
        <Blob color={C.lime} size={380} blur={90} opacity={0.06} className="bottom-[-60px] right-[18%]"
          style={{ transform: `translate(${mouse.x*-0.4}px, ${mouse.y*-0.4}px)` }} />

        <div className="absolute left-4 lg:left-16 top-20 hidden md:block" style={{ transform: `translateY(${scrollY*-0.07}px)` }}>
          <DNAHelix />
        </div>
        <div className="absolute right-4 lg:right-16 top-28 hidden lg:block" style={{ transform: `translateY(${scrollY*-0.04}px) scaleX(-1)` }}>
          <DNAHelix height={420} />
        </div>

        <div className="relative z-10 text-center max-w-3xl mx-auto">
          <Reveal>
            <Badge variant="outline"
              className="mb-6 border-white/15 text-white/50 font-normal text-xs tracking-wide px-3 py-1 rounded-full"
              style={{ background: "rgba(255,255,255,0.03)" }}>
              Ferguson Lab · UCSD
            </Badge>
          </Reveal>

          <Reveal delay={100}>
            <h1 className="text-6xl sm:text-7xl md:text-8xl font-bold tracking-tight leading-[0.92]" style={{ fontFamily: serif }}>
              <span className="bg-clip-text text-transparent"
                style={{ backgroundImage: `linear-gradient(135deg, ${C.blue} 0%, ${C.seafoam} 40%, ${C.lime} 70%, ${C.gold} 100%)` }}>
                Cleave
              </span>
            </h1>
          </Reveal>

          <Reveal delay={220}>
            <p className="mt-6 text-lg sm:text-xl text-white/55 leading-relaxed max-w-xl mx-auto">
              A self-hosted CUT&RUN / CUT&Tag bioinformatics platform.
              <br />
              <span className="text-white/40">From FASTQ to peaks to publication — in one interface.</span>
            </p>
          </Reveal>

          <Reveal delay={340}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Link to="/dashboard"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium text-white transition-all duration-300 hover:scale-[1.03] hover:shadow-lg"
                style={{ background: `linear-gradient(135deg, ${C.blue}, ${C.seafoam})`, boxShadow: `0 4px 24px ${C.blue}30` }}>
                Launch Dashboard <span className="text-base">→</span>
              </Link>
              <a href="#pipeline"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium text-white/70 border border-white/10 hover:bg-white/[0.06] hover:text-white transition-all duration-300"
                style={{ background: "rgba(255,255,255,0.03)" }}>
                Explore Pipeline
              </a>
              <a href="#compare"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium text-white/70 border border-white/10 hover:bg-white/[0.06] hover:text-white transition-all duration-300"
                style={{ background: "rgba(255,255,255,0.03)" }}>
                See What's New
              </a>
            </div>
          </Reveal>

          <Reveal delay={480}>
            <div className="mt-16 opacity-55 max-w-2xl mx-auto">
              <GenomeRuler />
              <PeakLandscape />
            </div>
          </Reveal>
        </div>

        <div className="absolute bottom-0 left-0 right-0"><ChromatinWave /></div>
      </section>

      {/* ═══ STATS ═══ */}
      <section className="relative py-16 px-6">
        <div ref={statsRef} className="max-w-3xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-8">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 100}>
              <StatCounter stat={s} active={statsVis} delay={i} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══ PIPELINE (v1 text) ═══ */}
      <section id="pipeline" className="relative py-28 px-6">
        <Blob color={C.blue} size={400} blur={100} opacity={0.05} className="top-0 right-[-120px]" />
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <p className="text-xs uppercase tracking-[0.2em] text-white/30 mb-3" style={{ fontFamily: mono }}>End-to-End Workflow</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ fontFamily: serif }}>
              One pipeline.{" "}
              <span className="bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(90deg, ${C.blue}, ${C.seafoam})` }}>Every stage.</span>
            </h2>
            <p className="mt-3 text-white/40 max-w-lg text-base leading-relaxed">
              Upload raw FASTQs and walk away. Cleave handles quality control, trimming, alignment, peak calling, and visualization — with real-time status updates via SSE.
            </p>
          </Reveal>

          <div className="mt-16 relative">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {PIPELINE_STEPS.map((step, i) => (
                <Reveal key={step.label} delay={i * 80} direction={i % 2 === 0 ? "up" : "scale"}>
                  <div className="relative group rounded-2xl p-5 h-full transition-all duration-300 hover:-translate-y-1.5 cursor-default"
                    style={{ background: C.card, border: `1px solid ${C.border}` }}>
                    <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                      style={{ background: `radial-gradient(circle at 50% 30%, ${step.color}08, transparent 70%)` }} />
                    <div className="relative z-10">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg mb-3 transition-transform duration-300 group-hover:scale-110"
                        style={{ background: `${step.color}12`, border: `1px solid ${step.color}20` }}>
                        {step.icon}
                      </div>
                      <div className="text-[11px] font-medium uppercase tracking-wider mb-1.5" style={{ color: step.color }}>Step {i + 1}</div>
                      <div className="text-sm font-semibold text-white/90 mb-1">{step.label}</div>
                      <div className="text-xs text-white/35 leading-snug">{step.desc}</div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>

          {/* Tech strip (v1 text) */}
          <Reveal delay={550}>
            <div className="mt-8 rounded-xl p-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/30"
              style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}`, fontFamily: mono }}>
              <span><span style={{ color: C.blue }} className="mr-1.5">●</span>SSE real-time updates</span>
              <span><span style={{ color: C.seafoam }} className="mr-1.5">●</span>JSONB job params</span>
              <span><span style={{ color: C.lime }} className="mr-1.5">●</span>Dependency chains</span>
              <span><span style={{ color: C.gold }} className="mr-1.5">●</span>Mock mode for dev</span>
              <span><span style={{ color: C.coral }} className="mr-1.5">●</span>Auto methods text</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ FEATURES (v1 text + v1 dot styling) ═══ */}
      <section id="features" className="relative py-28 px-6">
        <Blob color={C.seafoam} size={500} blur={120} opacity={0.06} className="top-[15%] left-[-160px]" />
        <Blob color={C.gold} size={420} blur={100} opacity={0.04} className="bottom-[5%] right-[-120px]" />
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <p className="text-xs uppercase tracking-[0.2em] text-white/30 mb-3" style={{ fontFamily: mono }}>Beyond CUTANA Cloud</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ fontFamily: serif }}>
              Built for{" "}
              <span className="bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(90deg, ${C.lime}, ${C.gold})` }}>your lab.</span>
            </h2>
            <p className="mt-3 text-white/40 max-w-lg text-base leading-relaxed">
              Every extension was designed around the Ferguson Lab's actual workflows — not generic bioinformatics features.
            </p>
          </Reveal>

          <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 70}>
                <div className="group relative rounded-2xl p-6 h-full transition-all duration-300 hover:-translate-y-1"
                  style={{ background: C.card, border: `1px solid ${C.border}` }}>
                  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{ background: `radial-gradient(circle at 30% 20%, ${f.color}0a, transparent 70%)` }} />
                  <div className="relative z-10">
                    <div className="w-2 h-2 rounded-full mb-4" style={{ background: f.color, boxShadow: `0 0 12px ${f.color}60` }} />
                    <h3 className="text-base font-bold text-white/90 mb-2" style={{ fontFamily: serif }}>{f.title}</h3>
                    <p className="text-sm text-white/40 leading-relaxed mb-4">{f.desc}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {f.tags.map(t => (
                        <span key={t} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                          style={{ background: `${f.color}12`, color: `${f.color}cc`, border: `1px solid ${f.color}20`, fontFamily: mono }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ COMPARE (v1 table styling — bigger, more readable) ═══ */}
      <section id="compare" className="relative py-28 px-6">
        <Blob color={C.coral} size={350} blur={90} opacity={0.06} className="top-[-50px] left-[30%]" />
        <div className="max-w-4xl mx-auto">
          <Reveal>
            <p className="text-xs uppercase tracking-[0.2em] text-white/30 mb-3" style={{ fontFamily: mono }}>Feature Comparison</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ fontFamily: serif }}>
              CUTANA Cloud vs{" "}
              <span className="bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(90deg, ${C.blue}, ${C.seafoam})` }}>Cleave</span>
            </h2>
          </Reveal>

          <Reveal delay={150}>
            <div className="mt-12 rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
              <table className="w-full text-sm" style={{ fontFamily: sans }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                    <th className="text-left py-3.5 px-5 text-white/50 font-medium text-xs uppercase tracking-wider">Feature</th>
                    <th className="text-center py-3.5 px-4 text-white/50 font-medium text-xs uppercase tracking-wider w-28">CUTANA</th>
                    <th className="text-center py-3.5 px-4 font-medium text-xs uppercase tracking-wider w-28" style={{ color: C.blue }}>Cleave</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row, i) => {
                    const isNew = !row.cutana;
                    return (
                      <tr key={row.feature}
                        className="transition-colors hover:!bg-white/[0.02]"
                        style={{
                          borderTop: `1px solid ${C.border}`,
                          background: isNew ? `${C.seafoam}06` : i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                        }}>
                        <td className="py-2.5 px-5 text-white/60">
                          {row.feature}
                          {isNew && (
                            <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider"
                              style={{ background: `${C.seafoam}18`, color: C.seafoam }}>
                              New
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          {row.cutana ? <span className="text-white/30">✓</span> : <span className="text-white/15">—</span>}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span style={{ color: C.seafoam, animation: isNew ? "subtlePulse 3s ease-in-out infinite" : "none" }}>✓</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Reveal>

          <Reveal delay={300}>
            <p className="mt-6 text-center text-xs text-white/25" style={{ fontFamily: mono }}>
              10 new features · 20 total capabilities · 500+ backend tests passing
            </p>
          </Reveal>
        </div>
      </section>

      {/* ═══ ARCHITECTURE (v2 diagram + v2 expanded lists + v1 text summary) ═══ */}
      <section id="architecture" className="relative py-28 px-6">
        <Blob color={C.lime} size={400} blur={100} opacity={0.05} className="bottom-0 right-[-100px]" />
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <p className="text-xs uppercase tracking-[0.2em] text-white/30 mb-3" style={{ fontFamily: mono }}>Architecture</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ fontFamily: serif }}>
              Built on{" "}
              <span className="bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(90deg, ${C.coral}, ${C.gold})` }}>proven tools.</span>
            </h2>
          </Reveal>

          {/* SVG architecture diagram from v2 */}
          <Reveal delay={150} direction="scale">
            <div className="mt-10 rounded-2xl p-6 sm:p-8 flex justify-center"
              style={{ background: C.card, border: `1px solid ${C.border}` }}>
              <ArchDiagram />
            </div>
          </Reveal>

          {/* Expanded stack columns from v2 */}
          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { layer: "Frontend", items: ["React 18 (Vite)", "TypeScript", "Tailwind CSS", "TanStack Query", "TanStack Table", "IGV.js", "Recharts"], color: C.blue },
              { layer: "Backend", items: ["FastAPI", "Python 3.11+", "SQLAlchemy 2.0", "Pydantic v2", "fastapi-users", "Alembic", "SSE"], color: C.seafoam },
              { layer: "Pipeline", items: ["Bowtie2", "SAMtools", "BEDTools", "Picard / deepTools", "MACS2 / SICER2", "SEACR / HOMER", "DiffBind (R)"], color: C.lime },
              { layer: "Infra", items: ["PostgreSQL 15+", "NGINX", "Docker Compose", "systemd", "AWS EC2", "Cloudflare DNS", "tus protocol"], color: C.gold },
            ].map((g, gi) => (
              <Reveal key={g.layer} delay={gi * 90} direction={gi < 2 ? "left" : "right"}>
                <div className="rounded-2xl p-5 h-full" style={{ background: C.card, border: `1px solid ${C.border}` }}>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] mb-4" style={{ color: g.color }}>{g.layer}</div>
                  <div className="space-y-2">
                    {g.items.map(item => (
                      <div key={item} className="text-sm text-white/55 flex items-center gap-2" style={{ fontFamily: mono }}>
                        <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: g.color, opacity: 0.6 }} />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Architecture text summary from v1 */}
          <Reveal delay={450}>
            <div className="mt-8 rounded-xl p-5" style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}` }}>
              <div className="text-xs text-white/25 text-center leading-relaxed" style={{ fontFamily: mono }}>
                Browser → NGINX (TLS) → FastAPI (Uvicorn) → PostgreSQL
                <br />
                <span className="text-white/15">↕ SSE · tus uploads · X-Accel-Redirect · JWT + httpOnly refresh</span>
                <br />
                Worker → Pipeline Modules → subprocess → /data/cleave/
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ FOOTER (v1 text + v2 colored dots style) ═══ */}
      <footer className="relative py-20 px-6">
        <div className="absolute inset-x-0 top-0"><ChromatinWave flip /></div>
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <Reveal>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ fontFamily: serif }}>
              <span className="bg-clip-text text-transparent"
                style={{ backgroundImage: `linear-gradient(135deg, ${C.blue}, ${C.seafoam}, ${C.lime})` }}>
                From FASTQ to figure.
              </span>
            </h2>
            <p className="mt-4 text-white/35 text-base leading-relaxed max-w-md mx-auto">
              Designed and built for the Ferguson Lab at UC San Diego. Self-hosted on a single EC2 instance for maximum reliability.
            </p>
          </Reveal>

          <Reveal delay={200}>
            <div className="mt-14 flex flex-col items-center gap-5">
              <div className="w-48 opacity-30"><GenomeRuler /></div>
              <div className="flex items-center gap-5 text-[11px] text-white/18" style={{ fontFamily: mono }}>
                {["React", "FastAPI", "PostgreSQL", "Bowtie2", "MACS2"].map((t, i) => (
                  <span key={t} className="flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full" style={{ background: [C.blue, C.seafoam, C.gold, C.lime, C.coral][i], opacity: 0.4 }} />
                    {t}
                  </span>
                ))}
              </div>
              <p className="text-xs text-white/15">
                © {new Date().getFullYear()} Cleave · Ferguson Lab, UCSD
              </p>
              <p className="text-xs text-white/25 mt-2 flex items-center justify-center gap-2">
                Built by{" "}
                <a href="https://www.linkedin.com/in/zakir-alibhai-541454276/" target="_blank" rel="noopener noreferrer"
                  className="text-white/40 hover:text-white/70 transition-colors underline underline-offset-2">
                  Zakir Alibhai
                </a>
                <span className="text-white/10">·</span>
                <a href="https://github.com/Zaki-1052/cleave" target="_blank" rel="noopener noreferrer"
                  className="text-white/40 hover:text-white/70 transition-colors inline-flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                  </svg>
                  Source
                </a>
              </p>
            </div>
          </Reveal>
        </div>
      </footer>
    </div>
  );
}
