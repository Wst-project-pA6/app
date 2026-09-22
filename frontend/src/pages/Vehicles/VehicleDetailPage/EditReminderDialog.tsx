import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useUpdateServiceReminderMutation } from '@/api/hooks/vehicles'
import { ApiError } from '@/api/errors'
import { Alert, Button, FormField, Modal, TextInput, useToast } from '@/components'
import type { ServiceReminder } from '@/api/types'

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

export function EditReminderDialog({
  reminder,
  vehicleId,
  onClose,
}: {
  reminder: ServiceReminder | null
  vehicleId: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const mutation = useUpdateServiceReminderMutation(vehicleId)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (reminder) {
      reset({
        title: reminder.title,
        dueDate: reminder.dueDate ?? '',
        dueMileage: reminder.dueMileage !== undefined ? String(reminder.dueMileage) : '',
        notes: reminder.notes ?? '',
      })
      mutation.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminder])

  async function onSubmit(values: FormValues) {
    if (!reminder) return
    try {
      await mutation.mutateAsync({
        reminderId: reminder.id,
        payload: {
          title: values.title,
          dueDate: values.dueDate || undefined,
          dueMileage: values.dueMileage ? Number(values.dueMileage) : undefined,
          notes: values.notes || undefined,
        },
      })
      showToast(t('vehicles.reminders.edit.success'), 'success')
      onClose()
    } catch {
      // surfaced below
    }
  }

  return (
    <Modal open={reminder !== null} onClose={onClose} title={t('vehicles.reminders.edit.title')}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {mutation.isError ? (
          <Alert variant="danger">
            {mutation.error instanceof ApiError ? mutation.error.message : t('errors.unknownError')}
          </Alert>
        ) : null}

        <FormField
          id="reminder-edit-title"
          label={t('vehicles.reminders.create.titleLabel')}
          error={errors.title ? t('validation.required') : undefined}
          required
        >
          <TextInput {...register('title')} />
        </FormField>

        <FormField
          id="reminder-edit-due-date"
          label={t('vehicles.reminders.create.dueDateLabel')}
          hint={t('common.optional')}
          error={errors.dueDate ? t('validation.reminderDueRequired') : undefined}
        >
          <TextInput type="date" dirStable {...register('dueDate')} />
        </FormField>

        <FormField
          id="reminder-edit-due-mileage"
          label={t('vehicles.reminders.create.dueMileageLabel')}
          hint={t('common.optional')}
        >
          <TextInput type="number" dirStable {...register('dueMileage')} />
        </FormField>

        <FormField
          id="reminder-edit-notes"
          label={t('vehicles.reminders.create.notesLabel')}
          hint={t('common.optional')}
        >
          <TextInput {...register('notes')} />
        </FormField>

        <Button type="submit" isLoading={isSubmitting}>
          {isSubmitting ? t('vehicles.reminders.edit.submitting') : t('vehicles.reminders.edit.submit')}
        </Button>
      </form>
    </Modal>
  )
}
