import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useCreateBayMutation } from '@/api/hooks/bays'
import { ApiError } from '@/api/errors'
import { Alert, Button, FormField, Modal, OrganizationScopeSelect, TextInput, useToast } from '@/components'

const schema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  capacity: z.number().int().min(1),
  organizationScopeId: z.string().min(1),
})

type FormValues = z.infer<typeof schema>

export function CreateBayDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const mutation = useCreateBayMutation()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: '', name: '', capacity: 1, organizationScopeId: '' },
  })

  const organizationScopeId = watch('organizationScopeId')

  useEffect(() => {
    if (open) {
      reset({ code: '', name: '', capacity: 1, organizationScopeId: '' })
      mutation.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function onSubmit(values: FormValues) {
    try {
      await mutation.mutateAsync(values)
      showToast(t('bays.create.success'), 'success')
      onClose()
    } catch {
      // surfaced below
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('bays.create.title')}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {mutation.isError ? (
          <Alert variant="danger">
            {mutation.error instanceof ApiError ? mutation.error.message : t('errors.unknownError')}
          </Alert>
        ) : null}

        <FormField
          id="bay-code"
          label={t('bays.create.codeLabel')}
          error={errors.code ? t('validation.required') : undefined}
          required
        >
          <TextInput dirStable {...register('code')} />
        </FormField>

        <FormField
          id="bay-name"
          label={t('bays.create.nameLabel')}
          error={errors.name ? t('validation.required') : undefined}
          required
        >
          <TextInput {...register('name')} />
        </FormField>

        <FormField
          id="bay-capacity"
          label={t('bays.create.capacityLabel')}
          error={errors.capacity ? t('validation.positiveInteger') : undefined}
          required
        >
          <TextInput type="number" dirStable {...register('capacity', { valueAsNumber: true })} />
        </FormField>

        <div>
          <label htmlFor="bay-scope">{t('bays.create.organizationScopeLabel')} *</label>
          <OrganizationScopeSelect
            id="bay-scope"
            value={organizationScopeId}
            onChange={(value) => setValue('organizationScopeId', value, { shouldValidate: true })}
            required
          />
        </div>

        <Button type="submit" isLoading={isSubmitting}>
          {isSubmitting ? t('bays.create.submitting') : t('bays.create.submit')}
        </Button>
      </form>
    </Modal>
  )
}
