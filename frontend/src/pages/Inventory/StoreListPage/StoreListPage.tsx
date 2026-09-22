import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useCreateStoreMutation, useStoresQuery, useUpdateStoreMutation } from '@/api/hooks/inventory'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import {
  Alert,
  Button,
  FilterBar,
  FormField,
  ListStateBoundary,
  Modal,
  OrganizationScopeSelect,
  PageHeader,
  Pagination,
  Select,
  StatusBadge,
  Table,
  TextInput,
  useToast,
  type TableColumn,
} from '@/components'
import { InventorySectionNav } from '../InventorySectionNav'
import { formatDate } from '@/lib/format'
import { useSearchParamPage, useSearchParamState } from '@/hooks/useSearchParamState'
import type { Store } from '@/api/types'

const PAGE_SIZE = 20

const createSchema = z.object({
  organizationScopeId: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
})
type CreateFormValues = z.infer<typeof createSchema>

const editSchema = z.object({ name: z.string().min(1), status: z.enum(['ACTIVE', 'INACTIVE']) })
type EditFormValues = z.infer<typeof editSchema>

export function StoreListPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()
  const canManage = hasAnyPermission(user, ['stores.manage'])

  const [status, setStatus] = useSearchParamState('status')
  const [sort, setSort] = useSearchParamState('sort', 'name')
  const [page, setPage] = useSearchParamPage()

  const storesQuery = useStoresQuery({
    page,
    pageSize: PAGE_SIZE,
    sort,
    status: status ? (status as 'ACTIVE' | 'INACTIVE') : undefined,
  })
  const createMutation = useCreateStoreMutation()
  const updateMutation = useUpdateStoreMutation()

  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Store | null>(null)

  const createForm = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { organizationScopeId: '', code: '', name: '' },
  })
  const editForm = useForm<EditFormValues>({ resolver: zodResolver(editSchema) })

  useEffect(() => {
    if (editing) editForm.reset({ name: editing.name, status: editing.status })
  }, [editing, editForm])

  async function onCreate(values: CreateFormValues) {
    try {
      await createMutation.mutateAsync(values)
      showToast(t('inventory.stores.create.success'), 'success')
      createForm.reset({ organizationScopeId: '', code: '', name: '' })
      setCreateOpen(false)
    } catch {
      // surfaced below
    }
  }

  async function onEdit(values: EditFormValues) {
    if (!editing) return
    try {
      await updateMutation.mutateAsync({ storeId: editing.id, payload: values })
      showToast(t('inventory.stores.edit.success'), 'success')
      setEditing(null)
    } catch {
      // surfaced below
    }
  }

  const columns: ReadonlyArray<TableColumn<Store>> = [
    { key: 'code', header: t('inventory.stores.columns.code'), render: (row) => row.code, dirStable: true },
    { key: 'name', header: t('inventory.stores.columns.name'), render: (row) => row.name },
    {
      key: 'status',
      header: t('common.status'),
      render: (row) => (
        <StatusBadge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {t(`inventory.stores.statusOptions.${row.status}`)}
        </StatusBadge>
      ),
    },
    { key: 'createdAt', header: t('common.createdAt'), render: (row) => formatDate(row.createdAt) },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: t('common.actions'),
            render: (row: Store) => (
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(row)}>
                {t('common.edit')}
              </Button>
            ),
          } satisfies TableColumn<Store>,
        ]
      : []),
  ]

  return (
    <div>
      <PageHeader
        title={t('inventory.stores.title')}
        actions={
          canManage ? (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              {t('inventory.stores.createAction')}
            </Button>
          ) : undefined
        }
      />
      <InventorySectionNav />

      <FilterBar>
        <Select aria-label={t('common.status')} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">{t('common.allStatuses')}</option>
          <option value="ACTIVE">{t('inventory.stores.statusOptions.ACTIVE')}</option>
          <option value="INACTIVE">{t('inventory.stores.statusOptions.INACTIVE')}</option>
        </Select>
        <Select aria-label={t('common.sortBy')} value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="name">{t('inventory.stores.columns.name')} ↑</option>
          <option value="code">{t('inventory.stores.columns.code')} ↑</option>
        </Select>
      </FilterBar>

      <ListStateBoundary
        isLoading={storesQuery.isLoading}
        isError={storesQuery.isError}
        error={storesQuery.error}
        onRetry={() => void storesQuery.refetch()}
        isEmpty={(storesQuery.data?.items.length ?? 0) === 0}
        emptyTitle={t('inventory.stores.empty.title')}
        emptyDescription={t('inventory.stores.empty.description')}
      >
        <Table columns={columns} rows={storesQuery.data?.items ?? []} getRowKey={(row) => row.id} />
        {storesQuery.data ? (
          <Pagination
            page={storesQuery.data.page.page}
            pageSize={storesQuery.data.page.pageSize}
            totalItems={storesQuery.data.page.totalItems}
            totalPages={storesQuery.data.page.totalPages}
            onPageChange={setPage}
          />
        ) : null}
      </ListStateBoundary>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t('inventory.stores.createAction')}>
        <form onSubmit={createForm.handleSubmit(onCreate)} noValidate>
          {createMutation.isError ? (
            <Alert variant="danger">
              {createMutation.error instanceof ApiError ? createMutation.error.message : t('errors.unknownError')}
            </Alert>
          ) : null}
          <FormField
            id="store-code"
            label={t('inventory.stores.columns.code')}
            error={createForm.formState.errors.code ? t('validation.required') : undefined}
            required
          >
            <TextInput dirStable {...createForm.register('code')} />
          </FormField>
          <FormField
            id="store-name"
            label={t('inventory.stores.columns.name')}
            error={createForm.formState.errors.name ? t('validation.required') : undefined}
            required
          >
            <TextInput {...createForm.register('name')} />
          </FormField>
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="store-scope">{t('bays.create.organizationScopeLabel')} *</label>
            <OrganizationScopeSelect
              id="store-scope"
              value={createForm.watch('organizationScopeId')}
              onChange={(value) => createForm.setValue('organizationScopeId', value, { shouldValidate: true })}
              required
            />
          </div>
          <Button type="submit" isLoading={createForm.formState.isSubmitting}>
            {t('inventory.stores.createAction')}
          </Button>
        </form>
      </Modal>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={t('inventory.stores.edit.title')}>
        <form onSubmit={editForm.handleSubmit(onEdit)} noValidate>
          {updateMutation.isError ? (
            <Alert variant="danger">
              {updateMutation.error instanceof ApiError ? updateMutation.error.message : t('errors.unknownError')}
            </Alert>
          ) : null}
          <FormField
            id="store-edit-name"
            label={t('inventory.stores.columns.name')}
            error={editForm.formState.errors.name ? t('validation.required') : undefined}
            required
          >
            <TextInput {...editForm.register('name')} />
          </FormField>
          <FormField id="store-edit-status" label={t('common.status')} required>
            <Select {...editForm.register('status')}>
              <option value="ACTIVE">{t('inventory.stores.statusOptions.ACTIVE')}</option>
              <option value="INACTIVE">{t('inventory.stores.statusOptions.INACTIVE')}</option>
            </Select>
          </FormField>
          <Button type="submit" isLoading={editForm.formState.isSubmitting}>
            {t('common.save')}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
