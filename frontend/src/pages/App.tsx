import { useEffect, useState } from 'react'
import { getAccuracy, getHealth } from '../services/api'
import type { AccuracyResponse, SourceStatus } from '../types/api'

const DEFAULT_DATE = '2026-01-01'
const DEFAULT_CUTOFF = '09:20'

export default function App() {
  const [deliveryDate, setDeliveryDate] = useState(DEFAULT_DATE)
  const [cutoffTime, setCutoffTime] = useState(DEFAULT_CUTOFF)
  const [sourceStatus, setSourceStatus] = useState<SourceStatus | null>(null)
  const [accuracy, setAccuracy] = useState<AccuracyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getHealth(controller.signal).then(setSourceStatus).catch(() => {
      if (!controller.signal.aborted) setSourceStatus(null)
    })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setAccuracy(null)

    getAccuracy(deliveryDate, cutoffTime, controller.signal)
      .then(setAccuracy)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Could not load accuracy data.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [deliveryDate, cutoffTime])

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto max-w-7xl px-6 py-8 sm:px-10">
        <header className="flex items-center justify-between border-b border-ink/10 pb-6">
          <a className="flex items-center gap-3" href="/" aria-label="WindScope home">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-forest text-lg font-bold text-white">W</span>
            <span>
              <span className="block text-lg font-semibold tracking-tight">WindScope</span>
              <span className="block text-xs text-ink/60">UK generation outlook</span>
            </span>
          </a>
          <div className="rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-medium text-ink/70">
            {sourceStatus ? 'API connected' : 'API unavailable'}
          </div>
        </header>

        <section className="py-12 sm:py-16">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-forest">Forecast analytics</p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">A clearer view of UK wind generation.</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-ink/65">
            Compare Elexon wind forecasts with reported generation outturn using the forecast available by the decision cutoff.
          </p>
        </section>

        <section className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <h2 className="text-lg font-semibold">Day-ahead forecast accuracy</h2>
              <p className="mt-1 text-sm text-ink/55">January 2026 · Elexon FUELHH WIND and WINDFOR · MW</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="grid gap-1 text-xs font-medium text-ink/65">
                Delivery date
                <input
                  aria-label="Delivery date"
                  className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink"
                  type="date"
                  min="2026-01-01"
                  max="2026-01-31"
                  value={deliveryDate}
                  onChange={(event) => setDeliveryDate(event.target.value)}
                />
              </label>
              <label className="grid gap-1 text-xs font-medium text-ink/65">
                Prior-day cutoff (UK time)
                <input
                  aria-label="Prior-day decision cutoff"
                  className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink"
                  type="time"
                  value={cutoffTime}
                  onChange={(event) => setCutoffTime(event.target.value)}
                />
              </label>
            </div>
          </div>

          {loading && <p className="mt-8 rounded-xl bg-canvas px-4 py-5 text-sm text-ink/65" role="status">Loading accuracy for {deliveryDate}…</p>}
          {error && <div className="mt-8 rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-800" role="alert"><p className="font-semibold">Could not load this report</p><p className="mt-1">{error}</p></div>}

          {accuracy && !loading && (
            <>
              <div className="mt-8 flex flex-wrap gap-x-8 gap-y-2 border-y border-ink/10 py-4 text-sm">
                <p><span className="text-ink/55">Decision cutoff (UTC): </span><span className="font-medium">{accuracy.cutoff}</span></p>
                <p><span className="text-ink/55">Matched hours: </span><span className="font-medium">{accuracy.paired_hours}/{accuracy.expected_hours}</span></p>
                <p><span className="text-ink/55">Missing forecast / actual: </span><span className="font-medium">{accuracy.missing_forecast_hours} / {accuracy.missing_actual_hours}</span></p>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="MAE" value={formatMetric(accuracy.mae_mw)} unit="MW" detail="Typical absolute error" />
                <MetricCard label="RMSE" value={formatMetric(accuracy.rmse_mw)} unit="MW" detail="Weights large errors more" />
                <MetricCard label="Bias" value={formatMetric(accuracy.bias_mw)} unit="MW" detail="Positive means over-forecast" />
                <MetricCard label="MAPE" value={formatMetric(accuracy.mape_percent)} unit="%" detail={`${accuracy.mape_sample_count} nonzero actual hours`} />
              </div>
              <p className="mt-5 text-xs leading-5 text-ink/55">
                Error is forecast minus actual. MAPE excludes zero actuals ({accuracy.mape_zero_actual_excluded_count} excluded). Actuals are hourly averages of the two half-hour FUELHH readings; incomplete hours remain missing.
              </p>
            </>
          )}
        </section>

        <section className="mt-5 grid gap-5 md:grid-cols-2">
          <SourceCard code="FUELHH" title="Actual generation" detail="Half-hourly outturn; WIND fuel category only" />
          <SourceCard code="WINDFOR" title="Wind forecast" detail="Forecast publications selected at or before the cutoff" />
        </section>
        <footer className="py-8 text-xs text-ink/45">WindScope · Source scope: Elexon FUELHH actuals + WINDFOR forecasts</footer>
      </div>
    </main>
  )
}

function formatMetric(value: number | null): string {
  return value === null ? 'Unavailable' : value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function MetricCard({ label, value, unit, detail }: { label: string; value: string; unit: string; detail: string }) {
  return (
    <article className="rounded-xl bg-canvas p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/55">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}<span className="ml-1 text-sm font-medium text-ink/50">{value === 'Unavailable' ? '' : unit}</span></p>
      <p className="mt-2 text-xs text-ink/55">{detail}</p>
    </article>
  )
}

function SourceCard({ code, title, detail }: { code: string; title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        <span className="rounded-md bg-canvas px-2 py-1 font-mono text-[10px] font-semibold text-forest">{code}</span>
      </div>
      <p className="mt-2 text-xs text-ink/55">{detail}</p>
    </div>
  )
}
