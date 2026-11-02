import { useEffect, useMemo, useState } from 'react'
import { getAccuracy, getIntervals } from '../services/api'
import type { AccuracyResponse, IntervalsResponse } from '../types/api'
import AccuracyStats from './AccuracyStats'
import GenerationChart, { type ChartPoint } from './GenerationChart'
import IntervalsTable from './IntervalsTable'

const FIRST_DATE = '2026-01-01'
const LAST_DATE = '2026-01-31'

export default function WindPerformanceReport() {
  const [deliveryDate, setDeliveryDate] = useState(FIRST_DATE)
  const [cutoffTime, setCutoffTime] = useState('09:20')
  const [accuracy, setAccuracy] = useState<AccuracyResponse | null>(null)
  const [intervals, setIntervals] = useState<IntervalsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showActual, setShowActual] = useState(true)
  const [showForecast, setShowForecast] = useState(true)
  const [selectedHour, setSelectedHour] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setAccuracy(null)
    setIntervals(null)
    setSelectedHour(null)

    Promise.all([
      getAccuracy(deliveryDate, cutoffTime, controller.signal),
      getIntervals(deliveryDate, cutoffTime, controller.signal),
    ]).then(([nextAccuracy, nextIntervals]) => {
      setAccuracy(nextAccuracy)
      setIntervals(nextIntervals)
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'The wind report could not be loaded.')
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [deliveryDate, cutoffTime])

  const chartData = useMemo<ChartPoint[]>(() => (intervals?.intervals ?? []).map((point) => ({
    ...point,
    time_label: formatTime(point.start_time),
  })), [intervals])

  function moveDate(days: number) {
    const date = new Date(`${deliveryDate}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + days)
    const next = date.toISOString().slice(0, 10)
    if (next >= FIRST_DATE && next <= LAST_DATE) setDeliveryDate(next)
  }

  function downloadCsv() {
    if (!intervals) return
    const rows: (string | number | null)[][] = [
      ['start_time_utc', 'forecast_mw', 'actual_mw', 'error_mw', 'forecast_publish_time_utc', 'actual_source_intervals'],
      ...intervals.intervals.map((point) => [
        point.start_time, point.forecast_mw, point.actual_mw, point.error_mw,
        point.forecast_publish_time, point.actual_source_intervals,
      ]),
    ]
    const csv = rows.map((row) => row.map((value) => {
      const text = value === null ? '' : String(value)
      return `"${text.replace(/"/g, '""')}"`
    }).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `windscope-wind-${deliveryDate}-cutoff-${cutoffTime}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="wind-report">
      <div className="wind-report-toolbar">
        <div className="wind-date-controls" aria-label="Wind delivery date">
          <button type="button" aria-label="Previous day" disabled={deliveryDate <= FIRST_DATE} onClick={() => moveDate(-1)}>‹</button>
          <label><span className="sr-only">Delivery date</span><input type="date" min={FIRST_DATE} max={LAST_DATE} value={deliveryDate} onChange={(event) => event.target.value && setDeliveryDate(event.target.value)} /></label>
          <button type="button" aria-label="Next day" disabled={deliveryDate >= LAST_DATE} onClick={() => moveDate(1)}>›</button>
        </div>
        <label className="wind-cutoff-control">Forecast cutoff <input type="time" value={cutoffTime} onChange={(event) => setCutoffTime(event.target.value)} /><small>UK local time, prior day</small></label>
        <span className="wind-toolbar-spacer" />
        <button className="quiet-button wind-export" type="button" disabled={!intervals} onClick={downloadCsv}>↓ <span>Export wind data</span></button>
      </div>

      {error && <div className="wind-error" role="alert"><strong>Wind report unavailable</strong><span>{error}</span></div>}
      <AccuracyStats accuracy={accuracy} loading={loading} />
      <div className="wind-chart-layout">
        <GenerationChart
          data={chartData}
          accuracy={accuracy}
          loading={loading}
          error={error}
          showActual={showActual}
          showForecast={showForecast}
          onToggleActual={() => setShowActual((visible) => !visible)}
          onToggleForecast={() => setShowForecast((visible) => !visible)}
          selectedHour={selectedHour}
        />
        <aside className="wind-summary-card">
          <span className="section-kicker">DELIVERY SUMMARY</span>
          <h3>Paired coverage</h3>
          <div className="wind-coverage-number"><strong>{loading ? '…' : accuracy?.paired_hours ?? '—'}</strong><span>of {accuracy?.expected_hours ?? '—'} hours</span></div>
          <div className="coverage-track" aria-label={accuracy ? `${accuracy.paired_hours} of ${accuracy.expected_hours} hours paired` : 'Coverage unavailable'}><span style={{ width: accuracy && accuracy.expected_hours > 0 ? `${(accuracy.paired_hours / accuracy.expected_hours) * 100}%` : '0%' }} /></div>
          <dl className="wind-summary-list">
            <div><dt>Forecast missing</dt><dd>{loading ? '…' : accuracy?.missing_forecast_hours ?? '—'}</dd></div>
            <div><dt>Actual missing</dt><dd>{loading ? '…' : accuracy?.missing_actual_hours ?? '—'}</dd></div>
            <div><dt>Cutoff applied</dt><dd>{accuracy ? `${formatDateTime(accuracy.cutoff)} UTC` : `${cutoffTime} UK`}</dd></div>
          </dl>
          <p>Actuals use FUELHH WIND only. An hourly actual requires both half-hour readings.</p>
        </aside>
      </div>
      <IntervalsTable intervals={intervals} loading={loading} selectedHour={selectedHour} onSelectHour={setSelectedHour} />
      <div className="wind-source-links"><span>Wind generation sources</span><a href="https://bmrs.elexon.co.uk/generation-forecast-for-wind-and-solar" target="_blank" rel="noreferrer">WINDFOR</a><a href="https://bmrs.elexon.co.uk/generation-by-fuel-type" target="_blank" rel="noreferrer">FUELHH</a></div>
    </div>
  )
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' })
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' })
}
