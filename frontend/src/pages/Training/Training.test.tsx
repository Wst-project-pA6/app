import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentUser, Permission } from '@/api/types'
import { tokenStorage } from '@/api/tokenStorage'
import { AuthContext, type AuthContextValue } from '@/auth/AuthContext'
import { AppRoutes } from '@/app/AppRoutes'
import { ThemeProvider } from '@/theme/ThemeProvider'
import i18n from '@/i18n'

const identity: CurrentUser = {
  id: 'assessor-1',
  email: 'mentor@example.com',
  displayName: 'Mentor',
  preferredLocale: 'en',
  roles: [],
  permissions: [],
  organizationScopeIds: [],
  mustChangePassword: false,
}
const page = { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 }
const assessment = {
  id: 'assessment-1',
  sessionId: 'session-1',
  studentId: 'student-1',
  taskId: 'task-1',
  courseId: 'course-1',
  result: 'PASS',
  timeOnTaskMinutes: 30,
  evidenceAttachmentIds: [],
  assessedBy: 'assessor-1',
  assessedAt: '2026-09-22T09:00:00Z',
  signOffStatus: 'PENDING',
  countsTowardCompletion: false,
  version: 3,
}
const session = {
  id: 'session-1',
  title: 'Brake inspection',
  courseId: 'course-1',
  groupId: 'group-1',
  bayId: 'bay-1',
  mentorId: 'mentor-1',
  startsAt: '2026-09-22T09:00:00Z',
  endsAt: '2026-09-22T10:00:00Z',
  status: 'DRAFT',
  version: 2,
}
function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function mount(path: string, permissions: Permission[] | null = ['training.read'], userId = identity.id) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const auth: AuthContextValue = {
    status: permissions ? 'authenticated' : 'unauthenticated',
    user: permissions ? { ...identity, id: userId, permissions } : null,
    error: null,
    login: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
    clearError: vi.fn(),
    refreshUser: vi.fn(),
  }
  return render(
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <AuthContext value={auth}>
          <MemoryRouter initialEntries={[path]}>
            <AppRoutes />
          </MemoryRouter>
        </AuthContext>
      </QueryClientProvider>
    </ThemeProvider>,
  )
}
beforeEach(async () => {
  tokenStorage.clear()
  await i18n.changeLanguage('en')
})
afterEach(async () => {
  vi.unstubAllGlobals()
  tokenStorage.clear()
  await i18n.changeLanguage('en')
})

describe('training resources', () => {
  it.each([
    ['terms', '/training-terms', { id: '1', name: 'Autumn training', status: 'ACTIVE' }, 'Autumn training'],
    ['courses', '/courses', { id: '1', name: { en: 'Brakes', ar: 'الفرامل' }, code: 'C-001' }, 'Brakes'],
    ['mentors', '/mentors', { id: '1', displayName: 'A real mentor' }, 'A real mentor'],
    ['students', '/students', { id: '1', studentNumber: '0000123', displayName: 'A real student' }, '0000123'],
    ['groups', '/training-groups', { id: '1', name: 'Morning group', enrolledCount: 4 }, 'Morning group'],
    [
      'tasks',
      '/practical-tasks',
      { id: '1', code: 'T-01', title: { en: 'Wheel inspection', ar: 'فحص العجلة' } },
      'Wheel inspection',
    ],
    ['competencies', '/competencies', { id: '1', code: 'COMP-01', name: { en: 'Braking', ar: 'الفرملة' } }, 'Braking'],
  ])('renders %s using its real contract endpoint', async (section, endpoint, row, label) => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, { items: [row], page }))
    vi.stubGlobal('fetch', fetchMock)
    mount(`/training/${section}`)
    expect(await screen.findByText(label)).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toContain(`/api/v1${endpoint}?`)
  })
  it('opens course details from the list without inventing a GET endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response(200, {
        items: [
          {
            id: 'course-1',
            code: 'C1',
            name: { en: 'Brakes', ar: 'الفرامل' },
            minimumAttendancePercent: 87,
            tasks: [],
          },
        ],
        page,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    mount('/training/courses')
    await userEvent.click(await screen.findByRole('button', { name: 'Details' }))
    expect(screen.getByText('87')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('renders session detail and does not offer attendance for a draft', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, session)))
    mount('/training/sessions/session-1', ['training.read', 'training.attendance.record'])
    expect(await screen.findByText('Brake inspection')).toBeInTheDocument()
    const form = screen.getByRole('form', { name: 'Record attendance' })
    expect(within(form).getByRole('button', { name: 'Record attendance' })).toBeDisabled()
  })
  it('uses the group-scoped enrollments endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response(200, { items: [{ id: 'e1', studentId: 'student-0001', status: 'ACTIVE' }], page }))
    vi.stubGlobal('fetch', fetchMock)
    mount('/training/enrollments?groupId=group-1')
    expect(await screen.findByText('student-0001')).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toContain('/training-groups/group-1/enrollments?')
  })
  it('shows calendar timestamps and sends date filters to the API', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(response(200, { items: [session], page })))
    vi.stubGlobal('fetch', fetchMock)
    mount('/training/calendar')
    expect(await screen.findByText(session.startsAt)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-22T00:00:00Z' } })
    await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    await waitFor(() => expect(fetchMock.mock.calls.at(-1)?.[0]).toContain('from=2026-09-22T00%3A00%3A00Z'))
    expect(fetchMock.mock.calls.at(-1)?.[0]).toContain('sort=startsAt')
  })
  it.each([404, 501])('renders unavailable rather than empty/success for HTTP %s', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(status, {})))
    mount('/training/assessments')
    expect(await screen.findByText(/Not yet available/)).toBeInTheDocument()
    expect(screen.queryByText('No records')).not.toBeInTheDocument()
    expect(screen.queryByText('The server confirmed the request.')).not.toBeInTheDocument()
  })
  it('preserves ordinary server errors and request ids', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(403, { code: 'FORBIDDEN', message: 'Scope denied', requestId: 'request-9' })),
    )
    mount('/training/terms')
    expect(await screen.findByText('Scope denied')).toBeInTheDocument()
    expect(screen.getByText(/request-9/)).toBeInTheDocument()
  })
  it('denies direct access without making a training request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    mount('/training/terms', ['students.self'])
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Apply filters' })).not.toBeInTheDocument())
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('supports students.self ANY-OF access to sessions without management controls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, { items: [session], page })))
    mount('/training/sessions', ['students.self'])
    expect(await screen.findByText('Brake inspection')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create draft session' })).not.toBeInTheDocument()
  })
  it('permits a manager to create a term without unauthorized list reads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(501, {}))
    vi.stubGlobal('fetch', fetchMock)
    mount('/training/terms', ['training.manage'])
    await userEvent.click(screen.getByRole('button', { name: 'Create term' }))
    const form = screen.getByRole('form', { name: 'Create term' })
    fireEvent.change(within(form).getByLabelText(/Organization scope id/), {
      target: { value: '11111111-1111-4111-8111-111111111111' },
    })
    fireEvent.change(within(form).getByLabelText(/^Name/), { target: { value: 'Autumn' } })
    fireEvent.change(within(form).getByLabelText(/Start date/), { target: { value: '2026-09-01' } })
    fireEvent.change(within(form).getByLabelText(/End date/), { target: { value: '2026-12-01' } })
    await userEvent.click(within(form).getByRole('button', { name: 'Create term' }))
    expect(await screen.findByText(/Not yet available/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST')
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      organizationScopeId: '11111111-1111-4111-8111-111111111111',
      name: 'Autumn',
      startDate: '2026-09-01',
      endDate: '2026-12-01',
    })
    expect(screen.queryByText('The server confirmed the request.')).not.toBeInTheDocument()
  })
  it('renders localized course names in Arabic', async () => {
    await i18n.changeLanguage('ar')
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          response(200, { items: [{ id: '1', name: { en: 'Brakes', ar: 'الفرامل' }, code: '000123' }], page }),
        ),
    )
    mount('/training/courses')
    expect(await screen.findByText('الفرامل')).toBeInTheDocument()
    expect(screen.getByText('000123')).toBeInTheDocument()
    expect(document.documentElement.dir).toBe('rtl')
  })
})

describe('assessment entry and supervisor separation', () => {
  async function open(permissions: Permission[], userId?: string) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, { items: [assessment], page })))
    mount('/training/assessments', permissions, userId)
    await userEvent.click(await screen.findByRole('button', { name: 'Details' }))
  }
  it('gates entry and revision to assess, with no supervisor control', async () => {
    await open(['training.read', 'training.assess'])
    expect(screen.getByRole('button', { name: 'Record assessment' })).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Revise assessment' })).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Supervisor sign-off' })).not.toBeInTheDocument()
    expect(screen.getAllByText('No').length).toBeGreaterThan(0)
  })
  it('shows a separate supervisor form without entry/revision permissions', async () => {
    await open(['training.read', 'training.signoff'], 'supervisor-1')
    expect(screen.getByRole('form', { name: 'Supervisor sign-off' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record assessment' })).not.toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Revise assessment' })).not.toBeInTheDocument()
  })
  it('disables self sign-off even when the assessor has both permissions', async () => {
    await open(['training.read', 'training.assess', 'training.signoff'])
    expect(
      within(screen.getByRole('form', { name: 'Supervisor sign-off' })).getByRole('button', {
        name: 'Supervisor sign-off',
      }),
    ).toBeDisabled()
  })
  it('uses the sign-off endpoint and surfaces server separation-of-duties rejection', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        response(409, { code: 'SEPARATION_OF_DUTIES_VIOLATION', message: 'The assessor cannot sign this result.' }),
      )
    vi.stubGlobal('fetch', fetchMock)
    mount('/training/sign-off', ['training.signoff'])
    fireEvent.change(screen.getByLabelText('Assessment id'), { target: { value: 'assessment-1' } })
    const form = screen.getByRole('form', { name: 'Supervisor sign-off' })
    await userEvent.selectOptions(within(form).getByLabelText(/Decision/), 'SIGNED_OFF')
    await userEvent.click(within(form).getByRole('checkbox'))
    await userEvent.click(within(form).getByRole('button', { name: 'Supervisor sign-off' }))
    expect(await screen.findByText('The assessor cannot sign this result.')).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/assessments/assessment-1/sign-off')
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ decision: 'SIGNED_OFF' })
    expect(screen.queryByText('The server confirmed the request.')).not.toBeInTheDocument()
  })
})

describe('computed results and scheduling', () => {
  it('displays server coverage strings unchanged and never calculates missing coverage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(200, {
          studentId: 's1',
          courseId: 'c1',
          overallPercent: '00042.5000',
          competencies: [{ competencyId: 'comp1', code: 'COMP', requiredTasks: 10, signedPassedRequiredTasks: 9 }],
        }),
      ),
    )
    mount('/training/coverage', ['students.self'])
    fireEvent.change(screen.getByLabelText('Student id'), { target: { value: 's1' } })
    fireEvent.change(screen.getByLabelText('Course id'), { target: { value: 'c1' } })
    await userEvent.click(screen.getByRole('button', { name: 'Load result' }))
    expect(await screen.findByText('00042.5000')).toBeInTheDocument()
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0)
    expect(screen.queryByText('90')).not.toBeInTheDocument()
  })
  it('only offers override selection for server-marked overridable conflicts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(200, {
          sessionId: 'session-1',
          hasConflicts: true,
          canPublish: false,
          conflicts: [
            {
              conflictKey: 'job-key',
              kind: 'BAY_JOB_CONFLICT',
              overridable: true,
              overridden: false,
              message: 'Job overlap',
            },
            {
              conflictKey: 'mentor-key',
              kind: 'MENTOR_SESSION_CONFLICT',
              overridable: false,
              overridden: false,
              message: 'Mentor overlap',
            },
          ],
        }),
      ),
    )
    mount('/training/conflicts', ['training.override-conflict'])
    fireEvent.change(screen.getByLabelText('Session id'), { target: { value: 'session-1' } })
    await userEvent.click(screen.getByRole('button', { name: 'Check scheduling conflicts' }))
    expect(await screen.findByRole('checkbox', { name: 'Job overlap' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Mentor overlap' })).not.toBeInTheDocument()
  })
  it('does not offer publish to a user who only has training.manage', () => {
    mount('/training/transitions', ['training.manage'])
    expect(screen.queryByRole('option', { name: 'Published' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Completed' })).toBeInTheDocument()
  })
})

describe('public certificate verification', () => {
  it('works without authentication, preserves opaque values, and renders only safe fields', async () => {
    const token = '000000000000000000000000000000000000000000001'
    tokenStorage.setAccessToken('private-bearer')
    const fetchMock = vi.fn().mockResolvedValue(
      response(200, {
        certificateNumber: '0000001234567890123456789',
        holderDisplayName: 'Sara M.',
        courseName: { en: 'Brakes', ar: 'الفرامل' },
        issuedAt: '2026-09-22T10:00:00Z',
        status: 'REVOKED',
        revokedAt: '2026-09-23T10:00:00Z',
        studentId: 'SECRET-STUDENT',
        grades: 'SECRET-GRADES',
        verificationToken: 'SECRET-TOKEN',
        revocationReason: 'SECRET-REASON',
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    mount(`/public/certificate-verifications/${token}`, null)
    expect(await screen.findByText('Sara M.')).toBeInTheDocument()
    expect(screen.getByText('0000001234567890123456789')).toBeInTheDocument()
    expect(screen.getByText('Revoked')).toBeInTheDocument()
    expect(screen.queryByText(/SECRET/)).not.toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/v1/public/certificate-verifications/${token}`)
    expect(new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).get('Authorization')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it.each([404, 501, 429, 500, 401])('handles HTTP %s safely without refresh or validity claims', async (status) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response(status, { code: 'UNKNOWN_ERROR', message: 'SECRET internal student information' }))
    vi.stubGlobal('fetch', fetchMock)
    mount('/public/certificate-verifications/opaque-token', null)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText(/SECRET/)).not.toBeInTheDocument()
    expect(screen.queryByText('Issued')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
