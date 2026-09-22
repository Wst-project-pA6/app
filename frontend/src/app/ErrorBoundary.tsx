import { Component, type ReactNode } from 'react'
import i18n from '@/i18n'
import { Alert, Button } from '@/components'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/** Catches unexpected rendering failures anywhere below it so one broken page can't blank the whole app. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(): void {
    // Intentionally no console logging of error details here beyond the
    // default React dev overlay: response bodies and tokens must never be
    // logged, and this boundary has no reliable way to filter arbitrary
    // thrown values.
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem' }}>
          <Alert variant="danger" title={i18n.t('errors.renderError.title')}>
            {i18n.t('errors.renderError.message')}
          </Alert>
          <div style={{ marginTop: '1rem' }}>
            <Button onClick={() => window.location.reload()}>{i18n.t('errors.renderError.reload')}</Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
