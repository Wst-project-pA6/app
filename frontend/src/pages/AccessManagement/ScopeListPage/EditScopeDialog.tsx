import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useUpdateOrganizationScopeMutation } from '@/api/hooks/organizationScopes'
import { ApiError } from '@/api/errors'
import { Alert, Button, FormField, Modal, Select, TextInput, useToast } from '@/components'
import type { OrganizationScope } from '@/api/types'

const schema = z.object({
  name: z.string().min(1),
  status: z.enum(['ACTIVE', 'INACTIVE']),
})

type FormValues = z.infer<typeof schema>

export function EditScopeDialog({ scope, onClose }: { scope: OrganizationScope | null; onClose: () => void }) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const mutation = useUpdateOrganizationScopeMutation()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (scope) {
      reset({ name: scope.name, status: scope.status })
      mutation.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])

  async function onSubmit(values: FormValues) {
    if (!scope) return
    try {
      await mutation.mutateAsync({ scopeId: scope.id, payload: values })
      showToast(t('access.scopes.edit.success'), 'success')
      onClose()
    } catch {
      // surfaced below
    }
  }

  return (
    <Modal open={scope !== null} onClose={onClose} title={t('access.scopes.edit.title')}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {mutation.isError ? (
          <Alert variant="danger">
            {mutation.error instanceof ApiError ? mutation.error.message : t('errors.unknownError')}
          </Alert>
        ) : null}

        <FormField
          id="scope-edit-name"
          label={t('access.scopes.edit.nameLabel')}
          error={errors.name ? t('validation.required') : undefined}
          required
        >
          <TextInput {...register('name')} />
        </FormField>

        <FormField id="scope-edit-status" label={t('access.scopes.edit.statusLabel')} required>
          <Select {...register('status')}>
            <option value="ACTIVE">{t('access.scopes.statusOptions.ACTIVE')}</option>
            <option value="INACTIVE">{t('access.scopes.statusOptions.INACTIVE')}</option>
          </Select>
        </FormField>

        <Button type="submit" isLoading={isSubmitting}>
          {isSubmitting ? t('access.scopes.edit.submitting') : t('access.scopes.edit.submit')}
        </Button>
      </form>
    </Modal>
  )
}
