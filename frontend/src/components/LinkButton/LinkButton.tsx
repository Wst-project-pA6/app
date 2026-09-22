import type { ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import buttonStyles from '../Button/Button.module.css'
import type { ButtonSize, ButtonVariant } from '../Button/Button'

export interface LinkButtonProps extends LinkProps {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
}

/** A route link styled like `Button`, for navigational actions (e.g. "New user") that must not be a `<button>`. */
export function LinkButton({ variant = 'primary', size = 'md', className, children, ...rest }: LinkButtonProps) {
  return (
    <Link
      className={[buttonStyles.button, buttonStyles[variant], buttonStyles[size], className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </Link>
  )
}
