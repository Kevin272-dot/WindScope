import type { IntervalsResponse } from '../types/api'

type Props = {
  intervals: IntervalsResponse | null
  loading: boolean
  selectedHour: string | null
  onSelectHour: (hour: string | null) => void
}

export default function IntervalsTable({ intervals, loading, selectedHour, onSelectHour }: Props) {
  return (
    <section className="data-panel table-panel" aria-labelledby="intervals-heading">
      <div className="panel-heading table-heading">
        <div><h2 id="intervals-heading">Hourly records</h2><p>Selected forecast publication and FUELHH actuals</p></div>
        {intervals && <span className="record-count">{intervals.intervals.length} delivery hours</span>}
      </div>
      {loading ? <div className="table-empty">Loading delivery hours…</div> : intervals ? (
        <div className="table-scroll">
          <table>
            <thead><tr><th>Delivery time <small>UTC</small></th><th>Forecast <small>MW · WINDFOR</small></th><th>Actual <small>MW · FUELHH WIND</small></th><th>Error <small>MW</small></th><th>Forecast published <small>UTC</small></th><th>Actual intervals</th></tr></thead>
            <tbody>{intervals.intervals.map((point) => {
              const time = formatTime(point.start_time)
              return <tr key={point.start_time} className={selectedHour === time ? 'row-selected' : ''} onMouseEnter={() => onSelectHour(time)} onMouseLeave={() => onSelectHour(null)}>
                <td><button className="time-select" type="button" aria-label={`Select ${time} UTC on chart`} onFocus={() => onSelectHour(time)} onBlur={() => onSelectHour(null)}>{time}</button></td>
                <td className="forecast-value">{format(point.forecast_mw)}</td>
                <td className="actual-value">{format(point.actual_mw)}</td>
                <td>{format(point.error_mw)}</td>
                <td className="publish-time">{point.forecast_publish_time ? formatTime(point.forecast_publish_time) : '—'}</td>
                <td>{point.actual_source_intervals}</td>
              </tr>
            })}</tbody>
          </table>
        </div>
      ) : <div className="table-empty">Hourly records will appear here when a local Elexon snapshot is available.</div>}
    </section>
  )
}

function format(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('en-GB', { maximumFractionDigits: 2 })
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC',
  })
}
