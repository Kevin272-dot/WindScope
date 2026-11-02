import type { NationalDemandForecastResponse } from '../types/api'

type Props = {
  forecast: NationalDemandForecastResponse | null
  loading: boolean
  error?: string | null
  selectedStart: string | null
  onSelect: (start: string | null) => void
  missingOnly: boolean
  onToggleMissing: () => void
}

export default function DemandPeriodsTable({ forecast, loading, error, selectedStart, onSelect, missingOnly, onToggleMissing }: Props) {
  const periods = (forecast?.intervals ?? []).filter((period) => !missingOnly || period.demand_mw === null)

  return (
    <section className="periods-card" aria-labelledby="periods-heading">
      <div className="periods-heading">
        <div><div className="section-kicker">SOURCE RECORDS</div><h3 id="periods-heading">Half-hourly periods</h3><p>Settlement period, local delivery time, and the Elexon NDF average demand value.</p></div>
        <div className="periods-actions">
          {forecast && forecast.missing_periods > 0 && <button className={`filter-button ${missingOnly ? 'is-active' : ''}`} type="button" aria-pressed={missingOnly} onClick={onToggleMissing}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 5h13M5.5 10h9m-6.5 5h4" /></svg>
            {missingOnly ? 'Show all periods' : `Show missing (${forecast.missing_periods})`}
          </button>}
          {forecast && <span className="period-count">{missingOnly ? periods.length : forecast.expected_periods} periods</span>}
        </div>
      </div>
      {loading ? <div className="periods-empty">Loading settlement-period records…</div> : error ? <div className="periods-empty" role="status">{error}</div> : forecast ? periods.length ? (
        <div className="periods-scroll">
          <table className="periods-table">
            <thead><tr><th>Period</th><th>Delivery start <small>UK local time</small></th><th>Demand <small>average MW</small></th><th>Source</th></tr></thead>
            <tbody>{periods.map((period) => {
              const selected = selectedStart === period.start_time
              const missing = period.demand_mw === null
              return <tr key={period.start_time} className={`${selected ? 'is-selected' : ''} ${missing ? 'is-missing' : ''}`} onMouseEnter={() => onSelect(period.start_time)} onMouseLeave={() => onSelect(null)}>
                <td><button className="period-select" type="button" onFocus={() => onSelect(period.start_time)} onBlur={() => onSelect(null)} aria-label={`Period ${period.settlement_period}, ${formatLocal(period.start_time)}${missing ? ', demand unavailable' : ''}`}>{String(period.settlement_period).padStart(2, '0')}</button></td>
                <td className="period-time">{formatLocal(period.start_time)} <span>{formatUtcTime(period.start_time)}</span></td>
                <td className={missing ? 'period-demand unavailable' : 'period-demand'}>{missing ? 'Unavailable' : period.demand_mw?.toLocaleString('en-GB', { maximumFractionDigits: 2 })}</td>
                <td><span className={`source-tag ${missing ? 'source-tag-missing' : ''}`}>{missing ? 'Missing' : 'NDF'}</span></td>
              </tr>
            })}</tbody>
          </table>
        </div>
      ) : <div className="periods-empty">No missing periods in this forecast.</div> : <div className="periods-empty">Settlement periods appear when Elexon publishes the selected day’s forecast.</div>}
      {forecast && <div className="periods-footnote">Source timestamps are preserved in UTC in the exported file. Display times use the Europe/London time zone.</div>}
    </section>
  )
}

function formatLocal(value: string): string {
  return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/London', timeZoneName: 'short' })
}

function formatUtcTime(value: string): string {
  return `${new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' })} UTC`
}
