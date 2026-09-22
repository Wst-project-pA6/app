import type { InputHTMLAttributes } from 'react'
import { forwardRef } from 'react'
import styles from './TextInput.module.css'

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Keeps the value directionally stable (LTR) even in an RTL layout, for IDs/codes/tokens. */
  dirStable?: boolean
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { className, dirStable, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={[styles.input, dirStable ? 'dir-ltr' : '', className].filter(Boolean).join(' ')}
      {...rest}
    />
  )
})
