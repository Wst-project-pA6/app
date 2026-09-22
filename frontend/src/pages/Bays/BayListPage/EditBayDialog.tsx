import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useUpdateBayMutation } from '@/api/hooks/bays'
import { ApiError } from '@/api/errors'
import { Alert, Button, ConfirmDialog, FormField, Modal, Select, TextInput, useToast } from '@/components'
import type { Bay } from '@/api/types'

const schema = z.object({
  name: z.string().min(1),
  capacity: z.number().int().min(1),
  status: z.enum(['ACTIVE', 'MAINTENANCE', 'INACTIVE']),
})

type FormValues = z.infer<typeof schema>

export function EditBayDialog({ bay, onClose }: { bay: Bay | null; onClose: () => void }) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const mutation = useUpdateBayMutation()
  const [pendingValues, setPendingValues] = useState<FormValues | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (bay) {
      reset({ name: bay.name, capacity: bay.capacity, status: bay.status })
      mutation.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bay])

  async function submit(values: FormValues) {
    if (!bay) return
    try {
      await mutation.mutateAsync({ bayId: bay.id, payload: values })
      showToast(t('bays.edit.success'), 'success')
      onClose()
    } catch {
      // surfaced below
    }
  }

  function onSubmit(values: FormValues) {
    if (values.status !== 'ACTIVE' && bay?.status === 'ACTIVE') {
      setPendingValues(values)
      return
    }
    void submit(values)
  }

  return (
    <>
      <Modal open={bay !== null} onClose={onClose} title={t('bays.edit.title')}>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          {mutation.isError ? (
            <Alert variant="danger">
              {mutation.error instanceof ApiError ? mutation.error.message : t('errors.unknownError')}
            </Alert>
          ) : null}

          <FormField
            id="bay-edit-name"
            label={t('bays.edit.nameLabel')}
            error={errors.name ? t('validation.required') : undefined}
            required
          >
            <TextInput {...register('name')} />
          </FormField>

          <FormField
            id="bay-edit-capacity"
            label={t('bays.edit.capacityLabel')}
            error={errors.capacity ? t('validation.positiveInteger') : undefined}
            required
          >
            <TextInput type="number" dirStable {...register('capacity', { valueAsNumber: true })} />
          </FormField>

          <FormField id="bay-edit-status" label={t('bays.edit.statusLabel')} required>
            <Select {...register('status')}>
              <option value="ACTIVE">{t('bays.statusOptions.ACTIVE')}</option>
              <option value="MAINTENANCE">{t('bays.statusOptions.MAINTENANCE')}</option>
              <option value="INACTIVE">{t('bays.statusOptions.INACTIVE')}</option>
            </Select>
          </FormField>

          <Button type="submit" isLoading={isSubmitting}>
            {isSubmitting ? t('bays.edit.submitting') : t('bays.edit.submit')}
          </Button>
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingValues !== null}
        title={t('bays.edit.statusChangeConfirmTitle')}
        description={t('bays.edit.statusChangeConfirmDescription')}
        tone="danger"
        isLoading={mutation.isPending}
        onConfirm={() => {
          if (pendingValues) void submit(pendingValues)
          setPendingValues(null)
        }}
        onCancel={() => setPendingValues(null)}
      />
    </>
  )
}
