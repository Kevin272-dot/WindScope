import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { DemandHistoryResponse, DemandHistoryDay } from '../types/api'

type KpiCardProps = {
  label: string
  value: number | null
  unit: string
  loading: boolean
  detail: string
  history: DemandHistoryResponse | null
  historyDays: number
  historyLoading: boolean
  historyError: string | null
}

/** Data-safe adaptation of 21st.dev's Progress Metric Card using Elexon history. */
export default function KpiCard({ label, value, unit, loading, detail, history, historyDays, historyLoading, historyError }: KpiCardProps) {
  const records = history?.days ?? []
  const completeDays = records.filter((day) => day.total_energy_mwh !== null).length

  return (
    <section className="demand-kpi" aria-label={label}>
      <div className="demand-kpi-primary">
        <p className="demand-kpi-label">{label}</p>
        <div className="demand-kpi-value">
          <strong>{loading ? '…' : value === null ? 'Unavailable' : format(value)}</strong>
          {!loading && value !== null && <span>{unit}</span>}
        </div>
        <p className="demand-kpi-detail">{detail}</p>
      </div>
      <div className="demand-kpi-trend" aria-label={`Historical forecast energy for the past ${historyDays} days`}>
        <div className="demand-kpi-trend-heading">
          <div><span>Recent forecast energy</span><small>Past {historyDays} days · MWh</small></div>
          <strong>{historyLoading ? '—' : `${completeDays} / ${history?.requested_days ?? historyDays}`}</strong>
        </div>
        <div className="demand-kpi-trend-plot">
          {historyLoading ? <span className="demand-kpi-trend-state">Loading history…</span> : historyError ? <span className="demand-kpi-trend-state">History unavailable</span> : completeDays >= 2 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={records} margin={{ top: 8, right: 4, left: 4, bottom: 2 }}>
                <defs><linearGradient id="historyEnergyFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a9ceb3" stopOpacity={0.34} /><stop offset="100%" stopColor="#a9ceb3" stopOpacity={0.015} /></linearGradient></defs>
                <XAxis dataKey="delivery_date" hide />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip
                  cursor={{ stroke: '#d5e5d9', strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const day = payload[0].payload as DemandHistoryDay
                    return <div className="demand-kpi-tooltip">
                      <strong>{formatHistoryDate(day.delivery_date)}</strong>
                      <span>{day.total_energy_mwh === null ? 'Unavailable' : `${format(day.total_energy_mwh)} MWh`}</span>
                    </div>
                  }}
                />
                <Area type="monotone" dataKey="total_energy_mwh" name="Forecast energy" stroke="#acd4b6" strokeWidth={2} fill="url(#historyEnergyFill)" dot={false} activeDot={{ r: 3, fill: '#d8ecdc', stroke: '#28513a', strokeWidth: 1 }} connectNulls={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <span className="demand-kpi-trend-state">Not enough complete days for a trend</span>}
        </div>
        {!historyLoading && !historyError && history && completeDays < history.requested_days && <small className="demand-kpi-trend-note">Incomplete days are left out of the line.</small>}
      </div>
    </section>
  )
}

function format(value: number): string {
  return value.toLocaleString('en-GB', { maximumFractionDigits: 1 })
}

function formatHistoryDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}
