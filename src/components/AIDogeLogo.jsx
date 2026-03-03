/**
 * AIDogeLogo — Branded SVG logo for AI DOGE platform.
 * Shield + magnifying glass motif representing transparency and accountability.
 *
 * Usage: <AIDogeLogo size={72} />
 */
export default function AIDogeLogo({ size = 64, className = '' }) {
  const id = 'aidoge-logo-' + Math.random().toString(36).slice(2, 8)
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="AI DOGE Logo"
    >
      <defs>
        {/* Shield gradient */}
        <linearGradient id={`${id}-shield`} x1="20" y1="10" x2="100" y2="110" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0a84ff" />
          <stop offset="50%" stopColor="#5e5ce6" />
          <stop offset="100%" stopColor="#0a84ff" />
        </linearGradient>
        {/* Inner glow */}
        <linearGradient id={`${id}-inner`} x1="30" y1="20" x2="90" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1c1c2e" />
          <stop offset="100%" stopColor="#0d0d1a" />
        </linearGradient>
        {/* Lens gradient */}
        <radialGradient id={`${id}-lens`} cx="55" cy="50" r="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="rgba(10, 132, 255, 0.15)" />
          <stop offset="100%" stopColor="rgba(10, 132, 255, 0.03)" />
        </radialGradient>
        {/* Outer glow */}
        <filter id={`${id}-glow`}>
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
        </filter>
      </defs>

      {/* Background glow */}
      <path
        d="M60 8 L105 30 L105 72 C105 92 85 108 60 115 C35 108 15 92 15 72 L15 30 Z"
        fill={`url(#${id}-shield)`}
        opacity="0.15"
        filter={`url(#${id}-glow)`}
      />

      {/* Shield body */}
      <path
        d="M60 12 L100 32 L100 70 C100 88 82 103 60 110 C38 103 20 88 20 70 L20 32 Z"
        fill={`url(#${id}-inner)`}
        stroke={`url(#${id}-shield)`}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* Inner shield highlight */}
      <path
        d="M60 18 L94 35 L94 68 C94 84 78 97 60 104 C42 97 26 84 26 68 L26 35 Z"
        fill="none"
        stroke="rgba(255, 255, 255, 0.06)"
        strokeWidth="1"
      />

      {/* Magnifying glass circle */}
      <circle cx="55" cy="52" r="20" fill={`url(#${id}-lens)`} stroke="#0a84ff" strokeWidth="2" opacity="0.9" />

      {/* Eye/scan lines inside lens */}
      <line x1="42" y1="46" x2="68" y2="46" stroke="#0a84ff" strokeWidth="1.5" opacity="0.4" strokeLinecap="round" />
      <line x1="42" y1="52" x2="68" y2="52" stroke="#0a84ff" strokeWidth="2" opacity="0.6" strokeLinecap="round" />
      <line x1="42" y1="58" x2="68" y2="58" stroke="#0a84ff" strokeWidth="1.5" opacity="0.4" strokeLinecap="round" />

      {/* Magnifying glass handle */}
      <line x1="69" y1="66" x2="83" y2="80" stroke="#5e5ce6" strokeWidth="4" strokeLinecap="round" />
      <line x1="69" y1="66" x2="83" y2="80" stroke="#0a84ff" strokeWidth="2.5" strokeLinecap="round" />

      {/* Checkmark dot */}
      <circle cx="55" cy="52" r="5" fill="#30d158" opacity="0.9" />
      <path d="M52 52 L54 54.5 L58 49.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />

      {/* Data nodes (transparency motif) */}
      <circle cx="36" cy="34" r="2.5" fill="#0a84ff" opacity="0.5" />
      <circle cx="74" cy="34" r="2.5" fill="#5e5ce6" opacity="0.5" />
      <circle cx="60" cy="86" r="2.5" fill="#30d158" opacity="0.5" />
      <line x1="36" y1="34" x2="55" y2="47" stroke="#0a84ff" strokeWidth="0.8" opacity="0.2" />
      <line x1="74" y1="34" x2="55" y2="47" stroke="#5e5ce6" strokeWidth="0.8" opacity="0.2" />
      <line x1="60" y1="86" x2="55" y2="57" stroke="#30d158" strokeWidth="0.8" opacity="0.2" />
    </svg>
  )
}
