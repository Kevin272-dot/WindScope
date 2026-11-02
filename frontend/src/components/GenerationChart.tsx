import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AccuracyResponse, IntervalPoint } from '../types/api'

export type ChartPoint = IntervalPoint & { time_label: string }

type Props = {
  data: ChartPoint[]
  accuracy: AccuracyResponse | null
  loading: boolean
  error: string | null
  showActual: boolean
  showForecast: boolean
  onToggleActual: () => void
  onToggleForecast: () => void
  selectedHour: string | null
}

export default function GenerationChart({ data, accuracy, loading, error, showActual, showForecast, onToggleActual, onToggleForecast, selectedHour }: Props) {
  const hasValues = data.some((point) => (showActual && point.actual_mw !== null) || (showForecast && point.forecast_mw !== null))

  return (
    <section className="data-panel chart-panel" aria-labelledby="generation-heading">
      <div className="panel-heading">
        <div><h2 id="generation-heading">Hourly generation</h2><p>Generation in MW <span>·</span> delivery times in UTC</p></div>
        <div className="series-controls" aria-label="Chart series">
          <button type="button" className={`series-toggle actual-toggle ${showActual ? 'selected' : ''}`} aria-pressed={showActual} onClick={onToggleActual}><i />Actual <small>FUELHH · WIND</small></button>
          <button type="button" className={`series-toggle forecast-toggle ${showForecast ? 'selected' : ''}`} aria-pressed={showForecast} onClick={onToggleForecast}><i />Forecast <small>WINDFOR</small></button>
        </div>
      </div>
      <div className="chart-area">
        {loading ? (
          <div className="chart-message"><span className="spinner" /><strong>Loading hourly report…</strong></div>
        ) : error ? (
          <div className="chart-message"><strong>No report to plot</strong><span>Load the local Elexon snapshot to display the hourly records.</span></div>
        ) : hasValues ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 12, right: 18, left: 4, bottom: 4 }}>
              <CartesianGrid vertical={false} stroke="#e9eeeb" strokeDasharray="2 5" />
              <XAxis dataKey="time_label" tick={{ fill: '#68776e', fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={26} dy={10} />
              <YAxis tick={{ fill: '#68776e', fontSize: 12 }} axisLine={false} tickLine={false} width={64} tickFormatter={(value: number) => value.toLocaleString('en-GB')} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const point = payload[0].payload as ChartPoint
                return <div className="chart-tooltip">
                  <strong>{point.time_label} UTC</strong>
                  <span className="actual-text">Actual <b>{format(point.actual_mw, ' MW')}</b></span>
                  <span className="forecast-text">Forecast <b>{format(point.forecast_mw, ' MW')}</b></span>
                  <small>Forecast published {point.forecast_publish_time ? formatTime(point.forecast_publish_time) : '—'}</small>
                </div>
              }} />
              {selectedHour && <ReferenceLine x={selectedHour} stroke="#7c8984" strokeDasharray="3 3" />}
              {showActual && <Line type="monotone" dataKey="actual_mw" name="Actual" stroke="#16836f" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} connectNulls={false} />}
              {showForecast && <Line type="monotone" dataKey="forecast_mw" name="Forecast" stroke="#d9943d" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} connectNulls={false} />}
            </LineChart>
          </ResponsiveContainer>
        ) : !showActual && !showForecast ? (
          <div className="chart-message"><strong>Select a series to plot</strong><span>Use the controls above to show actual generation or forecast.</span></div>
        ) : (
          <div className="chart-message"><strong>No generation values for this report</strong><span>Source gaps are left blank; no values are estimated.</span></div>
        )}
      </div>
      {accuracy && <div className="chart-footnote">Forecast error = forecast − actual. MAPE excludes {accuracy.mape_zero_actual_excluded_count} zero-generation actual hours.</div>}
    </section>
  )
}

function format(value: number | null, unit: string): string {
  return value === null ? '—' : `${value.toLocaleString('en-GB', { maximumFractionDigits: 2 })}${unit}`
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC',
  })
}
