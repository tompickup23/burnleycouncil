import { useState, useEffect, useRef } from 'react'

/**
 * Animated count-up hook using requestAnimationFrame.
 * Counts from 0 to `target` with easeOutExpo curve.
 * Respects prefers-reduced-motion.
 *
 * @param {number} target — the number to count up to
 * @param {object} opts
 * @param {number} opts.duration — animation duration in ms (default 1200)
 * @param {function} opts.formatter — format the display value (default: Math.round)
 * @returns {string|number} the current display value
 */
export function useCountUp(target, { duration = 1200, formatter = Math.round } = {}) {
  const [value, setValue] = useState(0)
  const prevTarget = useRef(0)

  useEffect(() => {
    // Skip animation if target hasn't actually changed or is 0
    if (target === prevTarget.current) return
    prevTarget.current = target
    if (!target) { setValue(0); return }

    // Respect prefers-reduced-motion
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }

    let raf
    const start = performance.now()
    const from = 0

    function tick(now) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      // easeOutExpo — fast start, smooth deceleration
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      setValue(from + (target - from) * eased)
      if (progress < 1) raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return formatter(value)
}
