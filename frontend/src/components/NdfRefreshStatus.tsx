import type { NationalDemandForecastResponse } from '../types/api'

type Props = {
  forecast: NationalDemandForecastResponse | null
  loading: boolean
  complete: boolean
}

export default function NdfRefreshStatus({ forecast, loading, complete }: Props) {
  const state = loading ? 'refreshing' : !forecast ? 'unavailable' : complete ? 'complete' : 'partial'
  const title = loading
    ? 'Refreshing Elexon NDF'
    : !forecast
      ? 'NDF unavailable'
      : complete
        ? 'Complete profile'
        : 'Partial profile'
  const detail = loading
    ? 'Checking the selected delivery day'
    : forecast
      ? `${forecast.observed_periods} of ${forecast.expected_periods} periods available`
      : 'No source profile returned'

  return (
    <section className={`ndf-refresh-status is-${state}`} aria-label="Elexon NDF source status" aria-live="polite" role="status">
      <div className="ndf-refresh-status-main">
        <span className="ndf-refresh-indicator" aria-hidden="true" />
        <div><strong>{title}</strong><small>{detail}</small></div>
      </div>
      <div className="ndf-refresh-time">
        <span>Latest source update · UTC</span>
        {forecast?.forecast_publish_time
          ? <time dateTime={forecast.forecast_publish_time}>{formatDateTime(forecast.forecast_publish_time)}</time>
          : <time>{loading ? 'Loading' : 'Not available'}</time>}
      </div>
    </section>
  )
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  })
}
