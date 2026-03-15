/**
 * usePDFExport — Hook for generating and downloading PDFs from React PDF documents.
 *
 * Uses @react-pdf/renderer's pdf() function to generate a blob client-side,
 * then triggers a browser download.
 */
import { useState, useCallback } from 'react'
import { pdf } from '@react-pdf/renderer'

/**
 * @returns {{ generatePDF, isGenerating }}
 */
export function usePDFExport() {
  const [isGenerating, setIsGenerating] = useState(false)

  const generatePDF = useCallback(async (document, filename) => {
    if (isGenerating) return
    setIsGenerating(true)
    try {
      const blob = await pdf(document).toBlob()
      const url = URL.createObjectURL(blob)
      const a = window.document.createElement('a')
      a.href = url
      a.download = filename || 'ai-doge-report.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[PDF] Generation failed:', err)
      // Fallback: alert user
      alert('PDF generation failed. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }, [isGenerating])

  return { generatePDF, isGenerating }
}
