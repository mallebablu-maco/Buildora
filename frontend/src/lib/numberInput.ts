import type { ClipboardEvent, KeyboardEvent } from 'react'

/**
 * Browsers let a number box take "e", "+" and "-" (for 1e5 or -3). Buildora's numbers are plain positive amounts,
 * so number boxes only take digits and one decimal point; "-" is allowed only where the box's minimum is negative.
 */
export function numberKeyGuard(min: number | string | undefined) {
  const allowMinus = min !== undefined && Number(min) < 0
  return {
    onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length > 1) return // shortcuts, arrows, Backspace, Tab…
      if (/[0-9]/.test(e.key)) return
      if (e.key === '.' && !e.currentTarget.value.includes('.')) return
      if (e.key === '-' && allowMinus) return
      e.preventDefault()
    },
    onPaste(e: ClipboardEvent<HTMLInputElement>) {
      const text = e.clipboardData.getData('text').trim()
      if (!(allowMinus ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/).test(text)) e.preventDefault()
    },
  }
}
