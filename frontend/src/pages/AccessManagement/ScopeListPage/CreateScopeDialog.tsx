import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useCreateOrganizationScopeMutation } from '@/api/hooks/organizationScopes'
import { ApiError } from '@/api/errors'
import { Alert, Button, FormField, Modal, Select, TextInput, useToast } from '@/components'
import type { OrganizationScope } from '@/api/types'

const schema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['BRANCH', 'STORE', 'TRAINING_PROGRAM']),
  parentId: z.string(),
})

type FormValues = z.infer<typeof schema>

export function CreateScopeDialog({
  open,
  onClose,
  existingScopes,
}: {
  open: boolean
  onClose: () => void
  existingScopes: ReadonlyArray<OrganizationScope>
}) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const mutation = useCreateOrganizationScopeMutation()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: '', name: '', type: 'BRANCH', parentId: '' },
  })

  useEffect(() => {
    if (open) {
      reset({ code: '', name: '', type: 'BRANCH', parentId: '' })
      mutation.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function onSubmit(values: FormValues) {
    try {
      await mutation.mutateAsync({
        code: values.code,
        name: values.name,
        type: values.type,
        ...(values.parentId ? { parentId: values.parentId } : {}),
      })
      showToast(t('access.scopes.create.success'), 'success')
      onClose()
    } catch {
      // surfaced below
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('access.scopes.create.title')}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {mutation.isError ? <CreateScopeErrorAlert error={mutation.error} /> : null}

        <FormField
          id="scope-code"
          label={t('access.scopes.create.codeLabel')}
          error={errors.code ? t('validation.required') : undefined}
          required
        >
          <TextInput dirStable {...register('code')} />
        </FormField>

        <FormField
          id="scope-name"
          label={t('access.scopes.create.nameLabel')}
          error={errors.name ? t('validation.required') : undefined}
          required
        >
          <TextInput {...register('name')} />
        </FormField>

        <FormField id="scope-type" label={t('access.scopes.create.typeLabel')} required>
          <Select {...register('type')}>
            <option value="BRANCH">{t('access.scopes.typeOptions.BRANCH')}</option>
            <option value="STORE">{t('access.scopes.typeOptions.STORE')}</option>
            <option value="TRAINING_PROGRAM">{t('access.scopes.typeOptions.TRAINING_PROGRAM')}</option>
          </Select>
        </FormField>

        <FormField
          id="scope-parent"
          label={t('access.scopes.create.parentLabel')}
          hint={t('access.scopes.create.parentHint')}
        >
          <Select {...register('parentId')}>
            <option value="">{t('common.unassigned')}</option>
            {existingScopes.map((scope) => (
              <option key={scope.id} value={scope.id}>
                {scope.name}
              </option>
            ))}
          </Select>
        </FormField>

        <Button type="submit" isLoading={isSubmitting}>
          {isSubmitting ? t('access.scopes.create.submitting') : t('access.scopes.create.submit')}
        </Button>
      </form>
    </Modal>
  )
}

function CreateScopeErrorAlert({ error }: { error: unknown }) {
  const { t } = useTranslation()
  const message = error instanceof ApiError ? error.message : t('errors.unknownError')
  return <Alert variant="danger">{message}</Alert>
}
