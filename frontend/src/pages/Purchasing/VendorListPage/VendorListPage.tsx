import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useCreateVendorMutation, useUpdateVendorMutation, useVendorsQuery } from '@/api/hooks/purchasing'
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
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  StatusBadge,
  Table,
  TextInput,
  useToast,
  type TableColumn,
} from '@/components'
import { SectionNav } from '@/components/SectionNav/SectionNav'
import { useSearchParamPage, useSearchParamState } from '@/hooks/useSearchParamState'
import type { Vendor } from '@/api/types'

const PAGE_SIZE = 20
const E164_PATTERN = /^\+[1-9]\d{1,14}$/

const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  contactName: z.string().optional(),
  phone: z.union([z.string().regex(E164_PATTERN), z.literal('')]),
  email: z.union([z.string().email(), z.literal('')]),
})
type CreateFormValues = z.infer<typeof createSchema>

const editSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().optional(),
  phone: z.union([z.string().regex(E164_PATTERN), z.literal('')]),
  email: z.union([z.string().email(), z.literal('')]),
  status: z.enum(['ACTIVE', 'INACTIVE']),
})
type EditFormValues = z.infer<typeof editSchema>

export function VendorListPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()
  const canWrite = hasAnyPermission(user, ['vendors.write'])

  const [q, setQ] = useSearchParamState('q')
  const [status, setStatus] = useSearchParamState('status')
  const [page, setPage] = useSearchParamPage()

  const vendorsQuery = useVendorsQuery({
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    status: status ? (status as 'ACTIVE' | 'INACTIVE') : undefined,
  })
  const createMutation = useCreateVendorMutation()
  const updateMutation = useUpdateVendorMutation()

  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Vendor | null>(null)

  const createForm = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { code: '', name: '', contactName: '', phone: '', email: '' },
  })
  const editForm = useForm<EditFormValues>({ resolver: zodResolver(editSchema) })

  useEffect(() => {
    if (editing) {
      editForm.reset({
        name: editing.name,
        contactName: editing.contactName ?? '',
        phone: editing.phone ?? '',
        email: editing.email ?? '',
        status: editing.status,
      })
    }
  }, [editing, editForm])

  async function onCreate(values: CreateFormValues) {
    try {
      await createMutation.mutateAsync({
        code: values.code,
        name: values.name,
        ...(values.contactName ? { contactName: values.contactName } : {}),
        ...(values.phone ? { phone: values.phone } : {}),
        ...(values.email ? { email: values.email } : {}),
      })
      showToast(t('purchasing.vendors.create.success'), 'success')
      createForm.reset({ code: '', name: '', contactName: '', phone: '', email: '' })
      setCreateOpen(false)
    } catch {
      // surfaced below
    }
  }

  async function onEdit(values: EditFormValues) {
    if (!editing) return
    try {
      await updateMutation.mutateAsync({
        vendorId: editing.id,
        payload: {
          name: values.name,
          contactName: values.contactName || undefined,
          phone: values.phone || undefined,
          email: values.email || undefined,
          status: values.status,
        },
      })
      showToast(t('purchasing.vendors.edit.success'), 'success')
      setEditing(null)
    } catch {
      // surfaced below
    }
  }

  const columns: ReadonlyArray<TableColumn<Vendor>> = [
    { key: 'code', header: t('purchasing.vendors.columns.code'), render: (row) => row.code, dirStable: true },
    { key: 'name', header: t('purchasing.vendors.columns.name'), render: (row) => row.name },
    { key: 'contactName', header: t('purchasing.vendors.columns.contact'), render: (row) => row.contactName ?? '—' },
    { key: 'phone', header: t('purchasing.vendors.columns.phone'), render: (row) => row.phone ?? '—', dirStable: true },
    {
      key: 'status',
      header: t('common.status'),
      render: (row) => (
        <StatusBadge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {t(`inventory.stores.statusOptions.${row.status}`)}
        </StatusBadge>
      ),
    },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: t('common.actions'),
            render: (row: Vendor) => (
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(row)}>
                {t('common.edit')}
              </Button>
            ),
          } satisfies TableColumn<Vendor>,
        ]
      : []),
  ]

  return (
    <div>
      <PageHeader
        title={t('purchasing.vendors.title')}
        actions={
          canWrite ? (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              {t('purchasing.vendors.createAction')}
            </Button>
          ) : undefined
        }
      />
      <SectionNav
        items={[
          { to: '/purchasing/vendors', label: t('purchasing.vendors.title') },
          { to: '/purchasing/orders', label: t('purchasing.orders.title') },
          { to: '/purchasing/approval-policy', label: t('purchasing.policy.title') },
        ]}
      />

      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder={t('purchasing.vendors.searchPlaceholder')} />
        <Select aria-label={t('common.status')} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">{t('common.allStatuses')}</option>
          <option value="ACTIVE">{t('inventory.stores.statusOptions.ACTIVE')}</option>
          <option value="INACTIVE">{t('inventory.stores.statusOptions.INACTIVE')}</option>
        </Select>
      </FilterBar>

      <ListStateBoundary
        isLoading={vendorsQuery.isLoading}
        isError={vendorsQuery.isError}
        error={vendorsQuery.error}
        onRetry={() => void vendorsQuery.refetch()}
        isEmpty={(vendorsQuery.data?.items.length ?? 0) === 0}
        emptyTitle={t('purchasing.vendors.empty.title')}
        emptyDescription={t('purchasing.vendors.empty.description')}
      >
        <Table columns={columns} rows={vendorsQuery.data?.items ?? []} getRowKey={(row) => row.id} />
        {vendorsQuery.data ? (
          <Pagination
            page={vendorsQuery.data.page.page}
            pageSize={vendorsQuery.data.page.pageSize}
            totalItems={vendorsQuery.data.page.totalItems}
            totalPages={vendorsQuery.data.page.totalPages}
            onPageChange={setPage}
          />
        ) : null}
      </ListStateBoundary>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t('purchasing.vendors.createAction')}>
        <form onSubmit={createForm.handleSubmit(onCreate)} noValidate>
          {createMutation.isError ? (
            <Alert variant="danger">
              {createMutation.error instanceof ApiError ? createMutation.error.message : t('errors.unknownError')}
            </Alert>
          ) : null}
          <FormField
            id="vendor-code"
            label={t('purchasing.vendors.columns.code')}
            error={createForm.formState.errors.code ? t('validation.required') : undefined}
            required
          >
            <TextInput dirStable {...createForm.register('code')} />
          </FormField>
          <FormField
            id="vendor-name"
            label={t('purchasing.vendors.columns.name')}
            error={createForm.formState.errors.name ? t('validation.required') : undefined}
            required
          >
            <TextInput {...createForm.register('name')} />
          </FormField>
          <FormField id="vendor-contact" label={t('purchasing.vendors.columns.contact')} hint={t('common.optional')}>
            <TextInput {...createForm.register('contactName')} />
          </FormField>
          <FormField
            id="vendor-phone"
            label={t('purchasing.vendors.columns.phone')}
            hint={t('common.optional')}
            error={createForm.formState.errors.phone ? t('validation.phoneE164') : undefined}
          >
            <TextInput dirStable placeholder="+15551234567" {...createForm.register('phone')} />
          </FormField>
          <FormField
            id="vendor-email"
            label={t('customers.create.emailLabel')}
            hint={t('common.optional')}
            error={createForm.formState.errors.email ? t('validation.email') : undefined}
          >
            <TextInput type="email" dirStable {...createForm.register('email')} />
          </FormField>
          <Button type="submit" isLoading={createForm.formState.isSubmitting}>
            {t('purchasing.vendors.createAction')}
          </Button>
        </form>
      </Modal>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={t('purchasing.vendors.edit.title')}>
        <form onSubmit={editForm.handleSubmit(onEdit)} noValidate>
          {updateMutation.isError ? (
            <Alert variant="danger">
              {updateMutation.error instanceof ApiError ? updateMutation.error.message : t('errors.unknownError')}
            </Alert>
          ) : null}
          <FormField
            id="vendor-edit-name"
            label={t('purchasing.vendors.columns.name')}
            error={editForm.formState.errors.name ? t('validation.required') : undefined}
            required
          >
            <TextInput {...editForm.register('name')} />
          </FormField>
          <FormField
            id="vendor-edit-contact"
            label={t('purchasing.vendors.columns.contact')}
            hint={t('common.optional')}
          >
            <TextInput {...editForm.register('contactName')} />
          </FormField>
          <FormField
            id="vendor-edit-phone"
            label={t('purchasing.vendors.columns.phone')}
            hint={t('common.optional')}
            error={editForm.formState.errors.phone ? t('validation.phoneE164') : undefined}
          >
            <TextInput dirStable {...editForm.register('phone')} />
          </FormField>
          <FormField
            id="vendor-edit-email"
            label={t('customers.create.emailLabel')}
            hint={t('common.optional')}
            error={editForm.formState.errors.email ? t('validation.email') : undefined}
          >
            <TextInput type="email" dirStable {...editForm.register('email')} />
          </FormField>
          <FormField id="vendor-edit-status" label={t('common.status')} required>
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
