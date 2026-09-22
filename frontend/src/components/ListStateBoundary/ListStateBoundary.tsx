import type { ReactNode } from 'react'
import { EmptyState } from '../EmptyState/EmptyState'
import { QueryErrorPanel } from '../QueryErrorPanel/QueryErrorPanel'
import { Skeleton } from '../Skeleton/Skeleton'

export interface ListStateBoundaryProps {
  isLoading: boolean
  isError: boolean
  error?: unknown
  onRetry?: () => void
  isEmpty: boolean
  emptyTitle: ReactNode
  emptyDescription?: ReactNode
  emptyAction?: ReactNode
  children: ReactNode
}

/** Shared loading/error/empty handling for every server-driven list in Stage 2. */
export function ListStateBoundary({
  isLoading,
  isError,
  error,
  onRetry,
  isEmpty,
  emptyTitle,
  emptyDescription,
  emptyAction,
  children,
}: ListStateBoundaryProps) {
  if (isLoading) {
    return (
      <div role="status" aria-busy="true">
        <Skeleton height="2.5rem" />
        <div style={{ marginTop: '0.5rem' }}>
          <Skeleton height="2.5rem" />
        </div>
        <div style={{ marginTop: '0.5rem' }}>
          <Skeleton height="2.5rem" />
        </div>
      </div>
    )
  }

  if (isError) {
    return <QueryErrorPanel error={error} onRetry={onRetry} />
  }

  if (isEmpty) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
  }

  return <>{children}</>
}
