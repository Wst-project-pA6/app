import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '@/i18n'
import { ApiError } from '@/api/errors'
import { QueryErrorPanel } from './QueryErrorPanel'

describe('QueryErrorPanel', () => {
  it('displays the backend message and requestId for a structured ApiError', () => {
    const error = new ApiError({
      message: 'Invalid payload',
      code: 'VALIDATION_FAILED',
      status: 422,
      requestId: 'req-abc-123',
    })

    render(<QueryErrorPanel error={error} />)

    expect(screen.getByText('Invalid payload')).toBeInTheDocument()
    expect(screen.getByText(/req-abc-123/)).toBeInTheDocument()
  })

  it('falls back to a generic message for a non-ApiError', () => {
    render(<QueryErrorPanel error={new Error('boom')} />)
    expect(screen.queryByText(/req-/)).not.toBeInTheDocument()
  })

  it('invokes onRetry when the retry button is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    let retried = false
    render(<QueryErrorPanel error={new Error('boom')} onRetry={() => (retried = true)} />)

    await userEvent.click(screen.getByRole('button'))
    expect(retried).toBe(true)
  })
})
