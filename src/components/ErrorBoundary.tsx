import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
}

type State = {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  private retry = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-paper px-4">
          <p className="max-w-sm text-center text-sm text-signal" role="alert">
            Something went wrong rendering this screen.
          </p>
          <p className="max-w-sm text-center text-xs text-ink-muted">
            {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={this.retry}
            className="min-h-11 rounded-xl bg-flow px-5 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
