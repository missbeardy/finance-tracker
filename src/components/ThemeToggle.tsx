import { useTheme } from '@/lib/theme'

/** Compact light/dark control — 44px touch target. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className={[
        'inline-flex h-11 w-11 items-center justify-center rounded-2xl transition-colors duration-150',
        className,
      ].join(' ')}
    >
      <span aria-hidden className="text-[20px] leading-none">
        {isDark ? '☀️' : '🌙'}
      </span>
    </button>
  )
}
