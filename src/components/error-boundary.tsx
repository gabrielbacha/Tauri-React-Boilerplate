import { Component, type ErrorInfo, type ReactNode } from "react"

import { Button } from "@/components/ui/button"

type Props = {
  children: ReactNode
  fallback?: (args: { error: Error; reset: () => void }) => ReactNode
}

type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children

    if (this.props.fallback) {
      return this.props.fallback({ error: this.state.error, reset: this.reset })
    }

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="flex max-w-md flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-lg font-semibold">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">
              An unexpected error crashed this view. The original error is logged to the console.
            </p>
          </div>
          <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
            {this.state.error.message}
          </pre>
          <Button onClick={this.reset} size="sm" className="self-start">
            Try again
          </Button>
        </div>
      </div>
    )
  }
}
