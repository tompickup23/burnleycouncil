/**
 * Academic Paper PDF Design System
 * White-background, Times-Roman, Harvard referencing
 * Completely independent from dark-theme PDFDesignSystem.js
 */
import { StyleSheet } from '@react-pdf/renderer'

// Colour palette — academic monochrome
const BLACK = '#1a1a1a'
const DARK_GREY = '#333333'
const MID_GREY = '#666666'
const LIGHT_GREY = '#999999'
const TABLE_HEADER_BG = '#f0f0f0'
const TABLE_BORDER = '#333333'
const WHITE = '#ffffff'
const RULE_COLOUR = '#cccccc'

// Typography
const SERIF = 'Times-Roman'
const SERIF_BOLD = 'Times-Bold'
const SERIF_ITALIC = 'Times-Italic'
const SANS = 'Helvetica'
const SANS_BOLD = 'Helvetica-Bold'

const BODY_SIZE = 11
const BODY_LEADING = 16.5 // 1.5× line spacing

export const styles = StyleSheet.create({
  // --- Page ---
  page: {
    backgroundColor: WHITE,
    color: BLACK,
    fontFamily: SERIF,
    fontSize: BODY_SIZE,
    lineHeight: 1.5,
    paddingTop: 60,
    paddingBottom: 72,
    paddingLeft: 72,
    paddingRight: 72,
  },

  // --- Running Header ---
  runningHeader: {
    position: 'absolute',
    top: 28,
    left: 72,
    right: 72,
    fontSize: 8,
    fontFamily: SERIF_ITALIC,
    color: LIGHT_GREY,
    borderBottomWidth: 0.5,
    borderBottomColor: RULE_COLOUR,
    paddingBottom: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  // --- Page Number ---
  pageNumber: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    fontSize: 9,
    fontFamily: SERIF,
    color: MID_GREY,
    textAlign: 'center',
  },

  // --- Title Page ---
  titlePage: {
    backgroundColor: WHITE,
    color: BLACK,
    fontFamily: SERIF,
    paddingTop: 160,
    paddingBottom: 72,
    paddingLeft: 72,
    paddingRight: 72,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  titleMain: {
    fontSize: 22,
    fontFamily: SERIF_BOLD,
    textAlign: 'center',
    color: BLACK,
    marginBottom: 6,
    lineHeight: 1.3,
    maxWidth: 420,
  },
  titleSubtitle: {
    fontSize: 16,
    fontFamily: SERIF_ITALIC,
    textAlign: 'center',
    color: DARK_GREY,
    marginBottom: 48,
    maxWidth: 380,
  },
  titleAuthor: {
    fontSize: 13,
    fontFamily: SERIF,
    textAlign: 'center',
    color: DARK_GREY,
    marginBottom: 4,
  },
  titleAffiliation: {
    fontSize: 11,
    fontFamily: SERIF_ITALIC,
    textAlign: 'center',
    color: MID_GREY,
    marginBottom: 4,
  },
  titleDate: {
    fontSize: 11,
    fontFamily: SERIF,
    textAlign: 'center',
    color: MID_GREY,
    marginTop: 24,
  },
  titleRule: {
    width: 80,
    height: 1,
    backgroundColor: RULE_COLOUR,
    marginTop: 32,
    marginBottom: 32,
  },

  // --- Abstract ---
  abstractLabel: {
    fontSize: 12,
    fontFamily: SERIF_BOLD,
    marginBottom: 8,
    textAlign: 'center',
  },
  abstractText: {
    fontSize: 10,
    fontFamily: SERIF_ITALIC,
    lineHeight: 1.5,
    marginLeft: 36,
    marginRight: 36,
    marginBottom: 16,
    color: DARK_GREY,
  },

  // --- Headings ---
  h1: {
    fontSize: 16,
    fontFamily: SERIF_BOLD,
    color: BLACK,
    marginTop: 24,
    marginBottom: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: RULE_COLOUR,
    paddingBottom: 4,
  },
  h2: {
    fontSize: 13,
    fontFamily: SERIF_BOLD,
    color: BLACK,
    marginTop: 16,
    marginBottom: 8,
  },
  h3: {
    fontSize: 11,
    fontFamily: SERIF_BOLD,
    fontStyle: 'italic',
    color: DARK_GREY,
    marginTop: 12,
    marginBottom: 6,
  },

  // --- Body ---
  para: {
    fontSize: BODY_SIZE,
    fontFamily: SERIF,
    lineHeight: 1.5,
    marginBottom: 10,
    textAlign: 'justify',
  },
  bold: {
    fontFamily: SERIF_BOLD,
  },
  italic: {
    fontFamily: SERIF_ITALIC,
  },

  // --- Tables ---
  tableWrap: {
    marginTop: 8,
    marginBottom: 12,
  },
  tableCaption: {
    fontSize: 10,
    fontFamily: SERIF_ITALIC,
    marginBottom: 4,
    color: DARK_GREY,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: TABLE_BORDER,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: TABLE_HEADER_BG,
    borderTopWidth: 0.5,
    borderTopColor: TABLE_BORDER,
    borderBottomWidth: 1,
    borderBottomColor: TABLE_BORDER,
  },
  tableCell: {
    fontSize: 9,
    fontFamily: SANS,
    padding: 4,
    borderRightWidth: 0.5,
    borderRightColor: TABLE_BORDER,
  },
  tableCellLast: {
    fontSize: 9,
    fontFamily: SANS,
    padding: 4,
  },
  tableHeaderCell: {
    fontSize: 9,
    fontFamily: SANS_BOLD,
    padding: 4,
    borderRightWidth: 0.5,
    borderRightColor: TABLE_BORDER,
  },
  tableHeaderCellLast: {
    fontSize: 9,
    fontFamily: SANS_BOLD,
    padding: 4,
  },
  tableFooter: {
    fontSize: 8,
    fontFamily: SERIF_ITALIC,
    color: MID_GREY,
    marginTop: 2,
  },

  // --- Block quote ---
  blockquote: {
    fontSize: 10,
    fontFamily: SERIF_ITALIC,
    color: DARK_GREY,
    marginLeft: 36,
    marginRight: 36,
    marginTop: 8,
    marginBottom: 8,
    lineHeight: 1.4,
  },

  // --- Footnote ---
  footnote: {
    fontSize: 8,
    fontFamily: SERIF,
    color: MID_GREY,
    marginTop: 2,
    lineHeight: 1.3,
  },
  footnoteRule: {
    width: 80,
    height: 0.5,
    backgroundColor: RULE_COLOUR,
    marginTop: 16,
    marginBottom: 4,
  },

  // --- References ---
  referenceItem: {
    fontSize: 10,
    fontFamily: SERIF,
    lineHeight: 1.4,
    marginBottom: 6,
    paddingLeft: 24,
    textIndent: -24,
  },

  // --- Lists ---
  listItem: {
    fontSize: BODY_SIZE,
    fontFamily: SERIF,
    lineHeight: 1.5,
    marginBottom: 4,
    paddingLeft: 20,
  },
  listBullet: {
    position: 'absolute',
    left: 0,
    fontFamily: SERIF,
  },
})

// Format helpers
export const fmt = {
  gbp: (n) => {
    if (n == null || isNaN(n)) return '\u00a3?'
    const abs = Math.abs(n)
    if (abs >= 1e9) return `\u00a3${(n / 1e9).toFixed(1)}bn`
    if (abs >= 1e6) return `\u00a3${(n / 1e6).toFixed(1)}m`
    if (abs >= 1e3) return `\u00a3${(n / 1e3).toFixed(0)}k`
    return `\u00a3${n.toFixed(0)}`
  },
  gbpFull: (n) => {
    if (n == null || isNaN(n)) return '\u00a3?'
    return `\u00a3${Math.round(n).toLocaleString('en-GB')}`
  },
  pct: (n) => {
    if (n == null || isNaN(n)) return '?%'
    return `${n.toFixed(1)}%`
  },
  num: (n) => {
    if (n == null || isNaN(n)) return '?'
    return Math.round(n).toLocaleString('en-GB')
  },
  yr: (n) => {
    if (n == null || isNaN(n)) return '?'
    return n.toFixed(1)
  },
}

export default styles
