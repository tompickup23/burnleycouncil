/**
 * usePDFExport - Hook for generating and downloading PDFs from React PDF documents.
 *
 * Uses @react-pdf/renderer's pdf() function to generate a blob client-side,
 * then triggers a browser download.
 *
 * Includes sanitizePDFTree() which resolves function components (our PDF
 * components are pure, no hooks) and recursively strips null/undefined/boolean
 * children from the React element tree before passing to @react-pdf/renderer.
 * This is necessary because @react-pdf does NOT filter these values like React DOM,
 * causing "Cannot read properties of null (reading 'props')" crashes.
 */
import { useState, useCallback, Children, isValidElement, createElement } from 'react'
import { pdf, Document, Page, View, Text, Link, Image, Canvas, Svg } from '@react-pdf/renderer'

/** @react-pdf built-in component types - do NOT call these as functions */
const PDF_BUILTINS = new Set([Document, Page, View, Text, Link, Image, Canvas, Svg])

/**
 * Recursively sanitize a React element tree for @react-pdf/renderer.
 *
 * Two-phase approach:
 * 1. If the element is a user-defined function component (not @react-pdf built-in),
 *    call it to get the rendered output. Our PDF components are pure functions (no hooks)
 *    so this is safe. This resolves {condition && <X>} patterns that produce null children.
 * 2. Use React.Children.toArray() to filter null/undefined/boolean children,
 *    then recursively sanitize each remaining child element.
 *
 * Uses createElement (not cloneElement) to rebuild elements. This avoids a critical
 * bug: cloneElement(el, {}, ...[]) when safeChildren is empty becomes cloneElement(el, {})
 * which PRESERVES the original (null-containing) children instead of replacing them.
 */
function sanitizePDFTree(element) {
  // Primitives (strings, numbers) pass through safely
  if (!isValidElement(element)) return element

  // If it's a user-defined function component, call it to get the actual tree.
  // This is critical: <LeaderBriefingPDF .../> is a function component whose
  // body contains {condition && <Page>} patterns that produce null children.
  // The sanitizer must see the RENDERED output, not just the outer element.
  if (typeof element.type === 'function' && !PDF_BUILTINS.has(element.type)) {
    try {
      const rendered = element.type({ ...element.props })
      return sanitizePDFTree(rendered)
    } catch (_e) {
      // If calling fails (shouldn't for our pure PDF components), fall through
    }
  }

  // If element has no children, return as-is (preserves render props on Text etc.)
  if (element.props.children == null) return element

  // Children.toArray flattens fragments and FILTERS null/undefined/boolean
  const safeChildren = Children.toArray(element.props.children)
    .map(child => sanitizePDFTree(child))

  // Rebuild element with createElement to guarantee children replacement.
  // Extract children from props (we pass them as separate args to createElement).
  const { children: _c, ...restProps } = element.props
  if (element.key != null) restProps.key = element.key
  return createElement(element.type, restProps, ...safeChildren)
}

/**
 * @returns {{ generatePDF, isGenerating }}
 */
export function usePDFExport() {
  const [isGenerating, setIsGenerating] = useState(false)

  const generatePDF = useCallback(async (document, filename) => {
    if (isGenerating) return
    setIsGenerating(true)
    try {
      // Resolve function components and strip null/undefined/boolean children
      // that would crash @react-pdf/renderer
      const safeDocument = sanitizePDFTree(document)
      const blob = await pdf(safeDocument).toBlob()
      const url = URL.createObjectURL(blob)
      const a = window.document.createElement('a')
      a.href = url
      a.download = filename || 'ai-doge-report.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[PDF] Generation failed:', err)
      alert(`PDF generation failed: ${err?.message || 'Unknown error'}. Check console for details.`)
    } finally {
      setIsGenerating(false)
    }
  }, [isGenerating])

  return { generatePDF, isGenerating }
}
