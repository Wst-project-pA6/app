import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { LanguageSwitcher } from './LanguageSwitcher'

describe('LanguageSwitcher', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('defaults to English with an LTR document direction', async () => {
    await i18n.changeLanguage('en')
    render(<LanguageSwitcher />)

    await waitFor(() => expect(document.documentElement.dir).toBe('ltr'))
    expect(document.documentElement.lang).toBe('en')
  })

  it('switches to Arabic and flips the document to RTL', async () => {
    render(<LanguageSwitcher />)

    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Language'), 'ar')

    await waitFor(() => expect(document.documentElement.dir).toBe('rtl'))
    expect(document.documentElement.lang).toBe('ar')
  })
})
