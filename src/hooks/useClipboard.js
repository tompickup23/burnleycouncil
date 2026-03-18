import { useState, useRef, useCallback } from 'react'

/**
 * Hook for copying text to clipboard with "Copied!" feedback.
 *
 * Usage:
 *   const { copy, copied } = useClipboard()
 *   <button onClick={() => copy(text)}>{copied ? 'Copied!' : 'Copy'}</button>
 *
 * @param {number} [timeout=2000] - ms before copied resets to false
 * @returns {{ copy: (text: string) => void, copied: boolean }}
 */
export function useClipboard(timeout = 2000) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)

  const copy = useCallback((text) => {
    const onSuccess = () => {
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), timeout)
    }

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(onSuccess).catch(() => {
        fallbackCopy(text) && onSuccess()
      })
    } else {
      fallbackCopy(text) && onSuccess()
    }
  }, [timeout])

  return { copy, copied }
}

/** Fallback for HTTP or older browsers */
function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    return true
  } catch {
    return false
  }
}
