'use client'

import { cn } from '@/lib/utils'

type Props = {
  value: number // 0..5
  onChange?: (v: number) => void
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClass = { sm: 'text-sm', md: 'text-base', lg: 'text-xl' }

// StarRating renders 5 stars. Read-only when onChange is undefined.
export function StarRating({ value, onChange, size = 'md', className }: Props) {
  const interactive = !!onChange
  return (
    <div className={cn('inline-flex items-center gap-0.5', sizeClass[size], className)}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = value >= n
        const star = (
          <span className={filled ? 'text-amber-500' : 'text-gray-300'}>★</span>
        )
        if (!interactive) return <span key={n}>{star}</span>
        return (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            onClick={() => onChange(n)}
            className="focus:outline-none focus:ring-2 focus:ring-brand-text/40 rounded"
          >
            {star}
          </button>
        )
      })}
    </div>
  )
}
