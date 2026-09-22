import type { ReactNode } from 'react'

/**
 * Applies a module's coordinated accent colors (see `[data-module]` rules in
 * `src/styles/tokens.css`) to everything rendered beneath it, via CSS custom
 * property inheritance. `display: contents` keeps this purely a theming
 * hook — it never participates in layout.
 */
export function ModuleTheme({ module, children }: { module: string; children: ReactNode }) {
  return (
    <div data-module={module} className="module-theme-root">
      {children}
    </div>
  )
}
