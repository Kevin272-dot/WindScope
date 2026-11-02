import type { DemandHistoryResponse, NationalDemandForecastResponse } from '../types/api'
import KpiCard from './KpiCard'
import NdfRefreshStatus from './NdfRefreshStatus'

type Props = {
  forecast: NationalDemandForecastResponse | null
  loading: boolean
  history: DemandHistoryResponse | null
  historyDays: number
  historyLoading: boolean
  historyError: string | null
}

export default function TomorrowDemandPanel({ forecast, loading, history, historyDays, historyLoading, historyError }: Props) {
  const complete = Boolean(forecast && forecast.missing_periods === 0 && forecast.total_energy_mwh !== null)
  const horizon = forecast ? forecast.source_selection === 'earliest' ? 'Today' : 'Tomorrow' : null
  const deliveryDate = forecast ? formatDate(forecast.delivery_date) : 'Next UK delivery day'
  const detail = loading
    ? 'Fetching the latest Elexon National Demand Forecast.'
    : complete
      ? `Sum of ${forecast?.expected_periods ?? 0} half-hour periods · Elexon NDF.`
      : forecast
        ? `The daily total is withheld because ${forecast.missing_periods} of ${forecast.expected_periods} periods have no valid demand value.`
        : 'The daily total will appear when a complete national demand forecast is available.'
  const coverage = forecast?.expected_periods ? forecast.observed_periods / forecast.expected_periods : 0

  return (
    <section className="demand-hero" aria-label={horizon ? `${horizon}'s national demand forecast` : 'National demand forecast'}>
      <div className="demand-hero-main">
        <div className="hero-overline"><span>ELEXON NDF</span><span className="hero-overline-divider">/</span><span>GREAT BRITAIN</span></div>
        <KpiCard label={horizon ? `${horizon}’s forecast energy demand` : 'Forecast energy demand'} value={forecast?.total_energy_mwh ?? null} unit="MWh" loading={loading} detail={detail} history={history} historyDays={historyDays} historyLoading={historyLoading} historyError={historyError} />
        <div className="hero-delivery-date">{deliveryDate}</div>
      </div>
      <aside className="demand-hero-aside" aria-label="Forecast context">
        <NdfRefreshStatus forecast={forecast} loading={loading} complete={complete} />
        <div className="hero-metric">
          <span className="hero-metric-label">Peak demand</span>
          <strong>{loading ? '—' : formatMetric(forecast?.peak_demand_mw ?? null, 'MW')}</strong>
          <small>{forecast?.peak_period_start ? `Expected ${formatLocal(forecast.peak_period_start)}` : 'Available for complete forecasts'}</small>
        </div>
        <div className="hero-metric coverage-metric">
          <div className="coverage-title"><span className="hero-metric-label">Forecast coverage</span><strong>{loading ? '—' : forecast ? `${forecast.observed_periods} / ${forecast.expected_periods}` : 'Unavailable'}</strong></div>
          <div className="demand-coverage-track" aria-label={forecast ? `${forecast.observed_periods} of ${forecast.expected_periods} periods available` : 'Coverage not available'}><span style={{ width: `${coverage * 100}%` }} /></div>
          <small>valid half-hour periods</small>
        </div>
      </aside>
    </section>
  )
}

function formatMetric(value: number | null, unit: string): string {
  return value === null ? 'Unavailable' : `${value.toLocaleString('en-GB', { maximumFractionDigits: 2 })} ${unit}`
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function formatLocal(value: string): string {
  return new Date(value).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/London', timeZoneName: 'short' })
}

