import { useRef, useState, useEffect } from 'react'

/**
 * Scroll-triggered reveal hook using IntersectionObserver.
 * Returns a ref to attach to the element and an isVisible boolean.
 * Adds 'is-visible' class when element enters viewport.
 * Falls back to always-visible in environments without IntersectionObserver (JSDOM).
 *
 * @param {object} opts
 * @param {number} opts.threshold — visibility threshold (default 0.12)
 * @param {string} opts.rootMargin — root margin (default '0px 0px -40px 0px')
 * @param {boolean} opts.once — only trigger once (default true)
 * @returns {[React.RefObject, boolean]}
 */
export function useReveal({ threshold = 0.12, rootMargin = '0px 0px -40px 0px', once = true } = {}) {
  const ref = useRef(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // JSDOM / SSR fallback — always visible
    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true)
      return
    }

    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          if (once) observer.unobserve(el)
        } else if (!once) {
          setIsVisible(false)
        }
      },
      { threshold, rootMargin }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, rootMargin, once])

  return [ref, isVisible]
}
