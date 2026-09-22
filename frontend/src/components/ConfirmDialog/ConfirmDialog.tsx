import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../Button/Button'
import { Modal } from '../Modal/Modal'
import styles from './ConfirmDialog.module.css'

export interface ConfirmDialogProps {
  open: boolean
  title: ReactNode
  description: ReactNode
  confirmLabel?: ReactNode
  cancelLabel?: ReactNode
  tone?: 'default' | 'danger'
  isLoading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Generic confirmation dialog for destructive or hard-to-reverse actions (disable user, archive, change bay status, remove roles). */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation()

  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className={styles.body}>{description}</div>
      <div className={styles.actions}>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isLoading}>
          {cancelLabel ?? t('common.cancel')}
        </Button>
        <Button
          type="button"
          variant={tone === 'danger' ? 'danger' : 'primary'}
          onClick={onConfirm}
          isLoading={isLoading}
          data-autofocus
        >
          {confirmLabel ?? t('common.submit')}
        </Button>
      </div>
    </Modal>
  )
}
