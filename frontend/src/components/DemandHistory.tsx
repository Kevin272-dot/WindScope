import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { DemandHistoryResponse } from '../types/api'

type Props = {
  history: DemandHistoryResponse | null
  loading: boolean
  error: string | null
  days: number
  onChangeDays: (days: number) => void
  selectedDeliveryDate: string | null
  onSelectDate: (deliveryDate: string) => void
}

export default function DemandHistory({ history, loading, error, days, onChangeDays, selectedDeliveryDate, onSelectDate }: Props) {
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)
  const records = history?.days ?? []
  const completeDays = records.filter((record) => record.total_energy_mwh !== null).length

  function downloadCsv() {
    if (!history) return
    const rows: (string | number | null)[][] = [
      ['delivery_date', 'forecast_energy_mwh', 'peak_demand_mw', 'observed_periods', 'expected_periods', 'missing_periods', 'latest_source_publish_time_utc'],
      ...history.days.map((record) => [
        record.delivery_date,
        record.total_energy_mwh,
        record.peak_demand_mw,
        record.observed_periods,
        record.expected_periods,
        record.missing_periods,
        record.forecast_publish_time,
      ]),
    ]
    const csv = rows.map((row) => row.map((value) => {
      const text = value === null ? '' : String(value)
      return `"${text.replace(/"/g, '""')}"`
    }).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `windscope-ndf-history-${days}-days.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="history-section" id="forecast-history" aria-labelledby="history-heading">
      <div className="history-heading">
        <div>
          <div className="section-kicker">RECENT FORECASTS</div>
          <h2 id="history-heading">Previous day-ahead demand</h2>
          <p>Daily energy totals from Elexon’s earliest published NDF for each settlement period. Select a date to open its full half-hour forecast.</p>
        </div>
        <div className="history-actions">
          <div className="history-range" data-active={days} role="group" aria-label="Forecast history range">
            <span className="history-range-indicator" aria-hidden="true" />
            {[10, 20].map((range) => <button key={range} type="button" aria-pressed={days === range} onClick={() => onChangeDays(range)}>{range} days</button>)}
          </div>
          <button className="history-export" type="button" disabled={!history} onClick={downloadCsv}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.5v9m0 0 3.5-3.5M10 12.5 6.5 9M4 14.5v2h12v-2" /></svg>
            Export history
          </button>
        </div>
      </div>

      <div className="history-card">
        <div className="history-summary">
          <div><span>Complete days</span><strong>{loading ? '—' : error ? 'Unavailable' : `${completeDays} / ${days}`}</strong></div>
          <div><span>Measure</span><strong>MWh per delivery day</strong></div>
          <div className="history-range-label"><span>Delivery dates</span><strong>{history ? `${formatShortDate(history.start_date)} — ${formatShortDate(history.end_date)}` : loading ? 'Loading' : 'Unavailable'}</strong></div>
        </div>

        <div className="history-chart-wrap">
          {loading ? <div className="history-state"><span className="spinner" /><strong>Loading previous NDF forecasts</strong></div> : error ? <div className="history-state history-state-error"><strong>Forecast history unavailable</strong><span>{error}</span></div> : records.some((record) => record.total_energy_mwh !== null) ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={records}
                margin={{ top: 14, right: 15, left: 4, bottom: 0 }}
                onMouseMove={(state) => {
                  const record = state?.activePayload?.[0]?.payload as typeof records[number] | undefined
                  setHoveredDate(record?.delivery_date ?? null)
                }}
                onMouseLeave={() => setHoveredDate(null)}
                onClick={(state) => {
                  const record = state?.activePayload?.[0]?.payload as typeof records[number] | undefined
                  if (record) onSelectDate(record.delivery_date)
                }}
              >
                <CartesianGrid vertical={false} stroke="#e9eeeb" strokeDasharray="2 5" />
                <XAxis dataKey="delivery_date" tick={{ fill: '#68776e', fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={18} tickFormatter={formatAxisDate} dy={10} />
                <YAxis tick={{ fill: '#68776e', fontSize: 12 }} axisLine={false} tickLine={false} width={78} tickFormatter={formatAxisValue} domain={['auto', 'auto']} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const record = payload[0].payload as typeof records[number]
                  return <div className="history-tooltip">
                    <strong>{formatDate(record.delivery_date)}</strong>
                    <span>Forecast energy <b>{formatEnergy(record.total_energy_mwh)}</b></span>
                    <span>Peak demand <b>{formatPower(record.peak_demand_mw)}</b></span>
                    <small>{record.observed_periods} of {record.expected_periods} periods · earliest NDF</small>
                  </div>
                }} />
                <Bar dataKey="total_energy_mwh" name="Forecast energy" radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false}>
                  {records.map((record) => <Cell key={record.delivery_date} fill={record.total_energy_mwh === null ? '#e9ede9' : selectedDeliveryDate === record.delivery_date ? '#285e40' : hoveredDate === record.delivery_date ? '#4f8060' : '#74a283'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="history-state"><strong>No complete daily totals in this range</strong><span>Missing source periods stay blank and are not estimated.</span></div>}
        </div>

        {error ? <div className="history-inline-error">The historical table is unavailable until Elexon responds successfully.</div> : <div className="history-table-scroll">
          <table className="history-table">
            <thead><tr><th>Delivery day</th><th>Forecast energy <small>MWh</small></th><th>Peak demand <small>MW</small></th><th>Period coverage</th><th>Latest source update <small>UTC</small></th></tr></thead>
            <tbody>{loading ? <tr><td colSpan={5} className="history-table-state">Loading daily records…</td></tr> : records.length ? [...records].reverse().map((record) => (
              <tr key={record.delivery_date} className={`${selectedDeliveryDate === record.delivery_date ? 'is-selected' : ''} ${hoveredDate === record.delivery_date ? 'is-highlighted' : ''}`} onMouseEnter={() => setHoveredDate(record.delivery_date)} onMouseLeave={() => setHoveredDate(null)}>
                <td><button className="history-date-select" type="button" aria-controls="demand-curve" aria-pressed={selectedDeliveryDate === record.delivery_date} onClick={() => onSelectDate(record.delivery_date)}>{formatDate(record.delivery_date)}<span>{selectedDeliveryDate === record.delivery_date ? 'Selected' : 'View forecast'}</span></button></td>
                <td className={record.total_energy_mwh === null ? 'history-value is-unavailable' : 'history-value'}>{formatEnergy(record.total_energy_mwh)}</td>
                <td>{formatPower(record.peak_demand_mw)}</td>
                <td><span className={`history-coverage ${record.missing_periods > 0 ? 'has-gaps' : ''}`}>{record.observed_periods} / {record.expected_periods}{record.missing_periods > 0 ? ` · ${record.missing_periods} missing` : ''}</span></td>
                <td>{record.forecast_publish_time ? formatDateTime(record.forecast_publish_time) : 'No source record'}</td>
              </tr>
            )) : <tr><td colSpan={5} className="history-table-state">No historic NDF records returned for these dates.</td></tr>}</tbody>
          </table>
        </div>}
        <div className="history-footnote">Historical figures use the earliest published NDF values available for each period. Daily MWh is shown only when every expected period has a numeric forecast.</div>
      </div>
    </section>
  )
}

function formatEnergy(value: number | null): string {
  return value === null ? 'Unavailable' : value.toLocaleString('en-GB', { maximumFractionDigits: 1 })
}

function formatPower(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('en-GB', { maximumFractionDigits: 2 })
}

function formatAxisValue(value: number): string {
  return `${(value / 1000).toLocaleString('en-GB', { maximumFractionDigits: 1 })}k`
}

function formatAxisDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function formatShortDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' })
}
