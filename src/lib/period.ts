import {
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfDay,
  endOfDay,
  differenceInCalendarDays,
  addDays,
  format,
  parseISO,
} from 'date-fns'

export type PeriodKey = 'this_month' | 'last_month' | 'pay_cycle' | 'custom'

export type DateRange = { start: string; end: string; label: string }

export function rangeForPeriod(
  key: PeriodKey,
  opts?: { payday?: string | null; customStart?: string; customEnd?: string },
): DateRange {
  const today = startOfDay(new Date())

  if (key === 'custom' && opts?.customStart && opts?.customEnd) {
    return {
      start: opts.customStart,
      end: opts.customEnd,
      label: `${opts.customStart} – ${opts.customEnd}`,
    }
  }

  if (key === 'last_month') {
    const anchor = subMonths(today, 1)
    const start = startOfMonth(anchor)
    const end = endOfMonth(anchor)
    return {
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
      label: format(start, 'MMM yyyy'),
    }
  }

  if (key === 'pay_cycle' && opts?.payday) {
    const payday = startOfDay(parseISO(opts.payday))
    // Fortnightly cycle containing today, anchored to payday
    const daysSince = differenceInCalendarDays(today, payday)
    const cycles = Math.floor(daysSince / 14)
    const start = addDays(payday, cycles * 14)
    const end = addDays(start, 13)
    return {
      start: format(start, 'yyyy-MM-dd'),
      end: format(endOfDay(end), 'yyyy-MM-dd').slice(0, 10),
      label: `Pay cycle ${format(start, 'd MMM')} – ${format(end, 'd MMM')}`,
    }
  }

  const start = startOfMonth(today)
  const end = endOfMonth(today)
  return {
    start: format(start, 'yyyy-MM-dd'),
    end: format(end, 'yyyy-MM-dd'),
    label: format(start, 'MMM yyyy'),
  }
}

export function previousRange(range: DateRange): DateRange {
  const start = parseISO(range.start)
  const end = parseISO(range.end)
  const days = differenceInCalendarDays(end, start) + 1
  const prevEnd = addDays(start, -1)
  const prevStart = addDays(prevEnd, -(days - 1))
  return {
    start: format(prevStart, 'yyyy-MM-dd'),
    end: format(prevEnd, 'yyyy-MM-dd'),
    label: `${format(prevStart, 'd MMM')} – ${format(prevEnd, 'd MMM')}`,
  }
}
