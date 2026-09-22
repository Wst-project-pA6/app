import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useCreateServiceReminderMutation } from '@/api/hooks/vehicles'
import { ApiError } from '@/api/errors'
import { Alert, Button, FormField, Modal, TextInput, useToast } from '@/components'

const schema = z
  .object({
    title: z.string().min(1),
    dueDate: z.string(),
    dueMileage: z.string(),
    notes: z.string(),
  })
  .refine((data) => data.dueDate !== '' || data.dueMileage !== '', {
    message: 'atLeastOne',
    path: ['dueDate'],
  })

type FormValues = z.infer<typeof schema>

export function CreateReminderDialog({
  open,
  onClose,
  vehicleId,
}: {
  open: boolean
  onClose: () => void
  vehicleId: string
}) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const mutation = useCreateServiceReminderMutation(vehicleId)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', dueDate: '', dueMileage: '', notes: '' },
  })

  useEffect(() => {
    if (open) {
      reset({ title: '', dueDate: '', dueMileage: '', notes: '' })
      mutation.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function onSubmit(values: FormValues) {
    try {
      await mutation.mutateAsync({
        title: values.title,
        ...(values.dueDate ? { dueDate: values.dueDate } : {}),
        ...(values.dueMileage ? { dueMileage: Number(values.dueMileage) } : {}),
        ...(values.notes ? { notes: values.notes } : {}),
      })
      showToast(t('vehicles.reminders.create.success'), 'success')
      onClose()
    } catch {
      // surfaced below
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('vehicles.reminders.create.title')}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {mutation.isError ? (
          <Alert variant="danger">
            {mutation.error instanceof ApiError ? mutation.error.message : t('errors.unknownError')}
          </Alert>
        ) : null}

        <FormField
          id="reminder-title"
          label={t('vehicles.reminders.create.titleLabel')}
          error={errors.title ? t('validation.required') : undefined}
          required
        >
          <TextInput {...register('title')} />
        </FormField>

        <FormField
          id="reminder-due-date"
          label={t('vehicles.reminders.create.dueDateLabel')}
          hint={t('common.optional')}
          error={errors.dueDate ? t('validation.reminderDueRequired') : undefined}
        >
          <TextInput type="date" dirStable {...register('dueDate')} />
        </FormField>

        <FormField
          id="reminder-due-mileage"
          label={t('vehicles.reminders.create.dueMileageLabel')}
          hint={t('common.optional')}
        >
          <TextInput type="number" dirStable {...register('dueMileage')} />
        </FormField>

        <FormField id="reminder-notes" label={t('vehicles.reminders.create.notesLabel')} hint={t('common.optional')}>
          <TextInput {...register('notes')} />
        </FormField>

        <Button type="submit" isLoading={isSubmitting}>
          {isSubmitting ? t('vehicles.reminders.create.submitting') : t('vehicles.reminders.create.submit')}
        </Button>
      </form>
    </Modal>
  )
}
