import type { ReactElement, ReactNode } from 'react'
import { cloneElement, isValidElement } from 'react'
import styles from './FormField.module.css'

interface FieldChildProps {
  id?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

export interface FormFieldProps {
  id: string
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  children: ReactElement<FieldChildProps>
}

/**
 * Associates a label, optional hint and optional error message with a
 * single form control via `htmlFor`/`id` and `aria-describedby`, and sets
 * `aria-invalid` when an error is present.
 */
export function FormField({ id, label, hint, error, required, children }: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  const control = isValidElement<FieldChildProps>(children)
    ? cloneElement(children, {
        id,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy,
      })
    : children

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required ? (
          <span aria-hidden="true" className={styles.required}>
            {' '}
            *
          </span>
        ) : null}
      </label>
      {control}
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
