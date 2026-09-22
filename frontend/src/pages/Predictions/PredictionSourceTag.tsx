import type { PredictionSource } from '@/api/types'

/** Renders a prediction's model/baseline attribution, always LTR (kind/name/version never mirror in RTL). */
export function PredictionSourceTag({ source }: { source: PredictionSource }) {
  return (
    <span className="dir-ltr" style={{ fontFamily: 'monospace', fontSize: 'var(--font-size-xs)' }}>
      {source.kind} · {source.name} · v{source.version}
    </span>
  )
}
