type Props = {
  message: string
  onRetry: () => void
}

/** Inline query failure with a retry control — prefer this over a blank section. */
export function QueryError({ message, onRetry }: Props) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl bg-surface p-4">
      <p className="text-sm text-signal" role="alert">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-11 rounded-xl bg-flow px-4 text-sm font-semibold text-white"
      >
        Retry
      </button>
    </div>
  )
}
