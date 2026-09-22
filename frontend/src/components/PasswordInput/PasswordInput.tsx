import { Eye, EyeOff } from 'lucide-react'
import type { InputHTMLAttributes } from 'react'
import { forwardRef, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import textInputStyles from '../TextInput/TextInput.module.css'
import styles from './PasswordInput.module.css'

export type PasswordInputProps = InputHTMLAttributes<HTMLInputElement>

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { className, ...rest },
  ref,
) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const buttonId = useId()

  return (
    <div className={styles.wrapper}>
      <input
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={[textInputStyles.input, styles.input, className].filter(Boolean).join(' ')}
        {...rest}
      />
      <button
        id={buttonId}
        type="button"
        className={styles.toggle}
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-label={visible ? t('auth.login.hidePassword') : t('auth.login.showPassword')}
      >
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </div>
  )
})
