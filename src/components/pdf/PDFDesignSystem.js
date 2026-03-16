/**
 * PDF Design System — World-class visual foundation for all AI DOGE PDF exports.
 *
 * Shared colors, typography, spacing, and style primitives used by all PDF documents.
 * Built on @react-pdf/renderer StyleSheet API.
 *
 * Design philosophy:
 * - Dark premium theme matching AI DOGE website (#0d1117 base)
 * - Reform UK accent (#12B6CF)
 * - Clean data-first layouts with generous whitespace
 * - Professional print-ready typography
 */
import { StyleSheet, Font } from '@react-pdf/renderer'

// ── Brand Colors ──
export const COLORS = {
  // Base palette
  bg: '#0d1117',
  bgCard: '#161b22',
  bgCardAlt: '#1c2333',
  bgHighlight: '#1e2a3a',
  bgAccent: 'rgba(18, 182, 207, 0.08)',

  // Text
  textPrimary: '#e6edf3',
  textSecondary: '#8b949e',
  textMuted: '#6e7681',
  textAccent: '#12B6CF',

  // Accent
  accent: '#12B6CF',
  accentDark: '#0d8fa3',
  accentLight: '#64d2ff',

  // Status
  success: '#30d158',
  warning: '#ff9f0a',
  danger: '#ff453a',
  info: '#64d2ff',

  // Party colors
  reform: '#12B6CF',
  labour: '#DC241F',
  conservative: '#0087DC',
  libDem: '#FAA61A',
  green: '#6AB023',
  independent: '#888888',

  // Borders
  border: '#30363d',
  borderLight: '#21262d',

  // Chart palette
  chart: ['#12B6CF', '#30d158', '#ff9f0a', '#ff453a', '#bf5af2', '#64d2ff', '#ffd60a', '#ff375f'],

  // Severity
  critical: '#ff453a',
  high: '#ff9f0a',
  medium: '#ffd60a',
  low: '#30d158',

  // Tier colors
  must_win: '#ff453a',
  competitive: '#ff9f0a',
  building: '#ffd60a',
  defend: '#30d158',
  long_shot: '#8b949e',
}

// ── Typography Scale ──
export const FONT = {
  // Sizes (pt)
  hero: 28,
  h1: 22,
  h2: 16,
  h3: 13,
  h4: 11,
  body: 9.5,
  small: 8.5,
  tiny: 7.5,
  micro: 6.5,

  // Weights
  bold: 'Helvetica-Bold',
  regular: 'Helvetica',
  light: 'Helvetica',
}

// ── Spacing Scale (pt) ──
export const SPACE = {
  xs: 3,
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  xxl: 36,
}

// ── Page Dimensions ──
export const PAGE = {
  width: 595.28,  // A4
  height: 841.89,
  margin: { top: 40, bottom: 50, left: 36, right: 36 },
  contentWidth: 595.28 - 72,  // minus left+right margins
}

// ── Core Styles ──
export const styles = StyleSheet.create({
  // ── Page ──
  page: {
    backgroundColor: COLORS.bg,
    paddingTop: PAGE.margin.top,
    paddingBottom: PAGE.margin.bottom,
    paddingHorizontal: PAGE.margin.left,
    color: COLORS.textPrimary,
    fontFamily: FONT.regular,
    fontSize: FONT.body,
  },
  pageLandscape: {
    backgroundColor: COLORS.bg,
    paddingTop: 30,
    paddingBottom: 40,
    paddingHorizontal: 30,
    color: COLORS.textPrimary,
    fontFamily: FONT.regular,
    fontSize: FONT.body,
  },

  // ── Header / Footer ──
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: COLORS.accent,
    paddingBottom: SPACE.sm,
    marginBottom: SPACE.lg,
  },
  headerTitle: {
    fontSize: FONT.h2,
    fontFamily: FONT.bold,
    color: COLORS.accent,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: FONT.small,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  headerBrand: {
    fontSize: FONT.tiny,
    color: COLORS.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  footer: {
    position: 'absolute',
    bottom: 16,
    left: PAGE.margin.left,
    right: PAGE.margin.right,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: SPACE.xs,
  },
  footerText: {
    fontSize: FONT.micro,
    color: COLORS.textMuted,
  },
  pageNumber: {
    fontSize: FONT.micro,
    color: COLORS.textMuted,
  },

  // ── Section headings ──
  sectionTitle: {
    fontSize: FONT.h2,
    fontFamily: FONT.bold,
    color: COLORS.textPrimary,
    marginTop: SPACE.lg,
    marginBottom: SPACE.md,
    paddingBottom: SPACE.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sectionSubtitle: {
    fontSize: FONT.h3,
    fontFamily: FONT.bold,
    color: COLORS.accent,
    marginTop: SPACE.md,
    marginBottom: SPACE.sm,
  },
  subsectionTitle: {
    fontSize: FONT.h4,
    fontFamily: FONT.bold,
    color: COLORS.textSecondary,
    marginTop: SPACE.sm,
    marginBottom: SPACE.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // ── Cards ──
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 6,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  cardAccent: {
    backgroundColor: COLORS.bgAccent,
    borderRadius: 6,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderLeftWidth: 3,
  },
  cardHighlight: {
    backgroundColor: COLORS.bgHighlight,
    borderRadius: 6,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },

  // ── Stat cards ──
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
    marginBottom: SPACE.md,
  },
  statCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 6,
    padding: SPACE.sm,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    flex: 1,
    minWidth: '22%',
  },
  statValue: {
    fontSize: FONT.h2,
    fontFamily: FONT.bold,
    color: COLORS.accent,
  },
  statLabel: {
    fontSize: FONT.tiny,
    color: COLORS.textSecondary,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDetail: {
    fontSize: FONT.micro,
    color: COLORS.textMuted,
    marginTop: 1,
  },

  // ── Tables ──
  table: {
    marginBottom: SPACE.md,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgCardAlt,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.accent,
    paddingVertical: SPACE.xs,
    paddingHorizontal: SPACE.sm,
  },
  tableHeaderCell: {
    fontSize: FONT.tiny,
    fontFamily: FONT.bold,
    color: COLORS.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    paddingVertical: 4,
    paddingHorizontal: SPACE.sm,
  },
  tableRowAlt: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    paddingVertical: 4,
    paddingHorizontal: SPACE.sm,
    backgroundColor: 'rgba(22, 27, 34, 0.5)',
  },
  tableCell: {
    fontSize: FONT.small,
    color: COLORS.textPrimary,
  },
  tableCellMuted: {
    fontSize: FONT.small,
    color: COLORS.textSecondary,
  },

  // ── Grid layouts ──
  row: {
    flexDirection: 'row',
    gap: SPACE.sm,
  },
  col2: {
    flex: 1,
  },
  col3: {
    flex: 1,
  },

  // ── Text styles ──
  text: {
    fontSize: FONT.body,
    color: COLORS.textPrimary,
    lineHeight: 1.5,
  },
  textSmall: {
    fontSize: FONT.small,
    color: COLORS.textSecondary,
    lineHeight: 1.4,
  },
  textBold: {
    fontFamily: FONT.bold,
    color: COLORS.textPrimary,
  },
  textAccent: {
    color: COLORS.accent,
    fontFamily: FONT.bold,
  },
  textDanger: {
    color: COLORS.danger,
    fontFamily: FONT.bold,
  },
  textSuccess: {
    color: COLORS.success,
  },
  textWarning: {
    color: COLORS.warning,
  },

  // ── Badges / Tags ──
  badge: {
    paddingHorizontal: SPACE.sm,
    paddingVertical: 2,
    borderRadius: 3,
    backgroundColor: COLORS.bgCardAlt,
  },
  badgeText: {
    fontSize: FONT.tiny,
    color: COLORS.textPrimary,
    fontFamily: FONT.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Bullet points ──
  bulletItem: {
    flexDirection: 'row',
    marginBottom: 3,
    paddingLeft: SPACE.xs,
  },
  bulletDot: {
    width: 10,
    fontSize: FONT.small,
    color: COLORS.accent,
  },
  bulletText: {
    flex: 1,
    fontSize: FONT.small,
    color: COLORS.textPrimary,
    lineHeight: 1.4,
  },

  // ── Dividers ──
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginVertical: SPACE.md,
  },
  dividerAccent: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.accent,
    marginVertical: SPACE.md,
  },

  // ── Hero section (cover page) ──
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACE.xxl * 3,
  },
  heroTitle: {
    fontSize: FONT.hero,
    fontFamily: FONT.bold,
    color: COLORS.accent,
    textAlign: 'center',
    letterSpacing: 1,
  },
  heroSubtitle: {
    fontSize: FONT.h2,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACE.md,
  },
  heroMeta: {
    fontSize: FONT.body,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACE.lg,
  },

  // ── Classification / Tier badges ──
  tierBadge: {
    paddingHorizontal: SPACE.sm,
    paddingVertical: 3,
    borderRadius: 4,
  },
  tierText: {
    fontSize: FONT.tiny,
    fontFamily: FONT.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Talking points ──
  talkingPoint: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgCard,
    borderRadius: 4,
    padding: SPACE.sm,
    marginBottom: 4,
    borderLeftWidth: 3,
  },
  talkingPointText: {
    flex: 1,
    fontSize: FONT.small,
    color: COLORS.textPrimary,
    lineHeight: 1.4,
  },
  talkingPointCategory: {
    fontSize: FONT.micro,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },

  // ── Confidential banner ──
  confidentialBanner: {
    backgroundColor: COLORS.danger,
    paddingVertical: 3,
    paddingHorizontal: SPACE.md,
    marginBottom: SPACE.md,
    borderRadius: 3,
  },
  confidentialText: {
    fontSize: FONT.tiny,
    color: '#ffffff',
    fontFamily: FONT.bold,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // ── Progress / Gauge ──
  progressBg: {
    height: 8,
    backgroundColor: COLORS.bgCardAlt,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
  },
})

// ── Utility Functions ──

export function tierColor(tier) {
  return COLORS[tier] || COLORS.textMuted
}

export function partyColor(party) {
  const map = {
    'Reform UK': COLORS.reform,
    'Labour': COLORS.labour,
    'Conservative': COLORS.conservative,
    'Liberal Democrats': COLORS.libDem,
    'Lib Dem': COLORS.libDem,
    'Green Party': COLORS.green,
    'Green': COLORS.green,
    'Independent': COLORS.independent,
  }
  return map[party] || COLORS.textMuted
}

export function severityColor(severity) {
  return COLORS[severity] || COLORS.textMuted
}

export function formatCurrency(value) {
  if (value == null) return '-'
  if (Math.abs(value) >= 1e9) return `£${(value / 1e9).toFixed(1)}B`
  if (Math.abs(value) >= 1e6) return `£${(value / 1e6).toFixed(1)}M`
  if (Math.abs(value) >= 1e3) return `£${(value / 1e3).toFixed(0)}K`
  return `£${value.toFixed(0)}`
}

export function formatPct(value, decimals = 1) {
  if (value == null) return '-'
  return `${Number(value).toFixed(decimals)}%`
}

export function formatNumber(value) {
  if (value == null) return '-'
  return Number(value).toLocaleString('en-GB')
}

export function formatDate(dateStr) {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return dateStr }
}

export function daysUntil(dateStr) {
  if (!dateStr) return null
  const target = new Date(dateStr)
  const now = new Date()
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24))
}
