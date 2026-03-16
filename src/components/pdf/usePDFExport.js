/**
 * usePDFExport - Hook for generating and downloading PDFs from React PDF documents.
 *
 * Uses @react-pdf/renderer's pdf() function to generate a blob client-side,
 * then triggers a browser download.
 *
 * Includes sanitizePDFElement() which recursively strips null/undefined/boolean
 * children from the React element tree before passing to @react-pdf/renderer.
 * This is necessary because @react-pdf does NOT filter these values like React DOM,
 * causing "Cannot read properties of null (reading 'props')" crashes.
 */
import { useState, useCallback, Children, isValidElement, cloneElement } from 'react'
import { pdf } from '@react-pdf/renderer'

/**
 * Recursively sanitize a React element tree for @react-pdf/renderer.
 * React.Children.toArray() filters null/undefined/boolean children,
 * then we recursively sanitize each remaining child element.
 *
 * This prevents crashes from:
 * - {condition && <Component>} patterns producing null/false children
 * - .map() callbacks returning null (even with .filter(Boolean))
 * - Conditional rendering producing undefined children
 */
function sanitizePDFElement(element) {
  // Primitives (strings, numbers) pass through safely
  if (!isValidElement(element)) return element

  // Children.toArray flattens fragments and FILTERS null/undefined/boolean
  const safeChildren = Children.toArray(element.props.children)
    .map(child => sanitizePDFElement(child))

  // Clone with sanitized children
  return cloneElement(element, {}, ...safeChildren)
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
      // Sanitize the element tree to remove null/undefined/boolean children
      // that would crash @react-pdf/renderer
      const safeDocument = sanitizePDFElement(document)
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
