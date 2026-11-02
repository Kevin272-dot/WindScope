import { useCallback, useEffect, useRef, useState } from 'react'
import { getDemandDay, getDemandHistory, getHealth, getPrimaryDemand, getPrimaryWindow } from '../services/api'
import type { DemandHistoryResponse, NationalDemandForecastResponse, SourceStatus } from '../types/api'
import TomorrowDemandPanel from '../components/TomorrowDemandPanel'
import DemandChart from '../components/DemandChart'
import DemandPeriodsTable from '../components/DemandPeriodsTable'
import DemandHistory from '../components/DemandHistory'
import WindPerformanceReport from '../components/WindPerformanceReport'
import CalendarBasic from '../components/ui/calendar-basic'

export default function App() {
  const [forecast, setForecast] = useState<NationalDemandForecastResponse | null>(null)
  const [selectedDayForecast, setSelectedDayForecast] = useState<NationalDemandForecastResponse | null>(null)
  const [selectedDeliveryDate, setSelectedDeliveryDate] = useState<string | null>(null)
  const [selectedDayLoading, setSelectedDayLoading] = useState(false)
  const [selectedDayError, setSelectedDayError] = useState<string | null>(null)
  const [selectedDayErrorDate, setSelectedDayErrorDate] = useState<string | null>(null)
  const [selectedDayRequestVersion, setSelectedDayRequestVersion] = useState(0)
  const [history, setHistory] = useState<DemandHistoryResponse | null>(null)
  const [historyDays, setHistoryDays] = useState(20)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sourceStatus, setSourceStatus] = useState<SourceStatus | null>(null)
  const [healthChecked, setHealthChecked] = useState(false)
  const [selectedStart, setSelectedStart] = useState<string | null>(null)
  const [missingOnly, setMissingOnly] = useState(false)
  const deliveryDatePicker = useRef<HTMLDetailsElement>(null)
  const primaryWindowKey = useRef<string | null>(null)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const result = await getPrimaryDemand(signal)
      setForecast(result)
      setSelectedDeliveryDate(result.delivery_date)
      if (deliveryDatePicker.current) deliveryDatePicker.current.open = false
      setSelectedDayForecast(null)
      setSelectedDayError(null)
      setSelectedDayErrorDate(null)
      setSelectedStart(null)
      setMissingOnly(false)
    } catch (reason: unknown) {
      if (!signal?.aborted) {
        setError(reason instanceof Error ? reason.message : 'The demand forecast could not be loaded.')
        setForecast(null)
        setSelectedDeliveryDate(null)
      }
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal)
    getHealth(controller.signal).then(setSourceStatus).catch(() => {
      if (!controller.signal.aborted) setSourceStatus(null)
    }).finally(() => {
      if (!controller.signal.aborted) setHealthChecked(true)
    })
    return () => controller.abort()
  }, [refresh])

  useEffect(() => {
    primaryWindowKey.current = getPrimaryWindow(new Date()).key
    const timer = window.setInterval(() => {
      const nextKey = getPrimaryWindow(new Date()).key
      if (nextKey !== primaryWindowKey.current) {
        primaryWindowKey.current = nextKey
        void refresh()
      }
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    const controller = new AbortController()
    setHistoryLoading(true)
    setHistoryError(null)
    setHistory(null)
    getDemandHistory(historyDays, controller.signal).then((result) => {
      setHistory(result)
      setSelectedDeliveryDate((current) => current && current < result.start_date ? result.start_date : current)
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) {
        setHistory(null)
        setHistoryError(reason instanceof Error ? reason.message : 'Demand history could not be loaded.')
      }
    }).finally(() => {
      if (!controller.signal.aborted) setHistoryLoading(false)
    })
    return () => controller.abort()
  }, [historyDays])

  useEffect(() => {
    const primaryDate = forecast?.delivery_date
    if (!selectedDeliveryDate || !primaryDate || selectedDeliveryDate === primaryDate) {
      setSelectedDayForecast(null)
      setSelectedDayError(null)
      setSelectedDayErrorDate(null)
      setSelectedDayLoading(false)
      return
    }
    const controller = new AbortController()
    setSelectedDayForecast(null)
    setSelectedDayError(null)
    setSelectedDayErrorDate(null)
    setSelectedDayLoading(true)
    getDemandDay(selectedDeliveryDate, controller.signal).then((result) => {
      if (!controller.signal.aborted) setSelectedDayForecast(result)
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) {
        setSelectedDayForecast(null)
        setSelectedDayError(reason instanceof Error ? reason.message : 'The selected day forecast could not be loaded.')
        setSelectedDayErrorDate(selectedDeliveryDate)
      }
    }).finally(() => {
      if (!controller.signal.aborted) setSelectedDayLoading(false)
    })
    return () => controller.abort()
  }, [selectedDeliveryDate, forecast?.delivery_date, selectedDayRequestVersion])

  const isPrimarySelected = selectedDeliveryDate === forecast?.delivery_date
  const profileForecast = isPrimarySelected
    ? forecast
    : selectedDayForecast?.delivery_date === selectedDeliveryDate ? selectedDayForecast : null
  const profileError = isPrimarySelected || !selectedDeliveryDate
    ? error
    : selectedDayErrorDate === selectedDeliveryDate ? selectedDayError : null
  const profileLoading = isPrimarySelected
    ? loading
    : !selectedDeliveryDate ? loading : selectedDayLoading || (!profileForecast && !profileError)

  function selectHistoryDate(deliveryDate: string) {
    if (deliveryDatePicker.current) deliveryDatePicker.current.open = false
    setSelectedDeliveryDate(deliveryDate)
    setSelectedStart(null)
    setMissingOnly(false)
    window.requestAnimationFrame(() => {
      document.getElementById('demand-curve')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function downloadCsv() {
    if (!profileForecast) return
    const rows: (string | number | null)[][] = [
      ['delivery_date', profileForecast.delivery_date],
      ['source_selection', profileForecast.source_selection],
      ['forecast_publish_time_utc', profileForecast.forecast_publish_time],
      ['settlement_period', 'start_time_utc', 'national_demand_mw', 'transmission_system_demand_mw', 'source_publish_time_utc', 'boundary'],
      ...profileForecast.intervals.map((period) => [
        period.settlement_period,
        period.start_time,
        period.demand_mw,
        period.source_record?.transmissionSystemDemand ?? null,
        period.source_record?.publishTime ?? null,
        period.source_record?.boundary ?? null,
      ]),
    ]
    const csv = rows.map((row) => row.map((value) => {
      const text = value === null ? '' : String(value)
      return `"${text.replace(/"/g, '""')}"`
    }).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `windscope-national-demand-${profileForecast.delivery_date}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const apiOnline = healthChecked && sourceStatus !== null
  const minimumDeliveryDate = history?.start_date ?? (forecast ? offsetDate(forecast.delivery_date, -21) : undefined)
  const minimumCalendarDate = minimumDeliveryDate ? parseLocalDate(minimumDeliveryDate) : undefined
  const maximumDeliveryDate = forecast ? offsetDate(getLondonDate(new Date()), 1) : undefined
  const maximumCalendarDate = maximumDeliveryDate ? parseLocalDate(maximumDeliveryDate) : undefined
  const selectedCalendarDate = selectedDeliveryDate ? parseLocalDate(selectedDeliveryDate) : undefined

  return (
    <main className="app-shell">
      <header className="app-header">
        <a className="wordmark" href="#top" aria-label="WindScope home">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>WindScope</span>
          <span className="brand-divider" />
          <span className="brand-product">Energy outlook</span>
        </a>
        <nav className="header-nav" aria-label="Page sections">
          <a className="header-nav-current" href="#wind-analysis">Wind report</a>
          <a href="#demand">Demand outlook</a>
          <a href="#forecast-history">Forecast history</a>
          <a href="#demand-curve">Demand curve</a>
        </nav>
        <div className={`connection-status ${healthChecked ? apiOnline ? 'is-online' : 'is-offline' : 'is-pending'}`}>
          <span className="status-dot" />
          <span>{healthChecked ? apiOnline ? 'API connected' : 'API unavailable' : 'Connecting'}</span>
        </div>
      </header>

      <div className="page-content" id="top">
        <section className="page-intro" id="wind-analysis">
          <div>
            <div className="eyebrow">DAY-AHEAD WIND FORECAST <span className="eyebrow-dot">·</span> JANUARY 2026</div>
            <h1>Wind forecast decision report</h1>
            <p>Review the latest WINDFOR forecast available at the decision cutoff against FUELHH WIND outturn and measured error.</p>
          </div>
        </section>
        <section className="wind-primary-section" aria-label="January wind forecast and accuracy">
          <WindPerformanceReport />
        </section>

        <section className="page-intro" id="demand">
          <div>
            <div className="eyebrow">NATIONAL DEMAND FORECAST <span className="eyebrow-dot">·</span> GREAT BRITAIN</div>
            <h1>{forecast ? `${forecast.source_selection === 'earliest' ? 'Today’s' : 'Tomorrow’s'} energy outlook` : 'Day-ahead energy outlook'}</h1>
            <p>Separate GB demand outlook, shown alongside the wind report for context.</p>
          </div>
          <div className="intro-actions">
            <button className="quiet-button refresh-button" type="button" onClick={() => void refresh()} disabled={loading}>
              <svg className={loading ? 'refresh-icon is-spinning' : 'refresh-icon'} viewBox="0 0 20 20" aria-hidden="true"><path d="M16.2 8A6.5 6.5 0 0 0 4.4 5.5L3 7m0 0V3.8M3 7h3.2M3.8 12A6.5 6.5 0 0 0 15.6 14.5L17 13m0 0v3.2M17 13h-3.2" /></svg>
              Refresh forecast
            </button>
            <button className="primary-button" type="button" onClick={downloadCsv} disabled={!profileForecast}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.5v9m0 0 3.5-3.5M10 12.5 6.5 9M4 14.5v2h12v-2" /></svg>
              Export profile
            </button>
          </div>
        </section>

        {error && <div className="error-banner" role="alert">
          <span className="error-icon" aria-hidden="true">!</span>
          <div><strong>Demand forecast unavailable</strong><p>{error}</p></div>
          <button className="text-button" type="button" onClick={() => void refresh()}>Try again</button>
        </div>}

        <TomorrowDemandPanel forecast={forecast} loading={loading} history={history} historyDays={historyDays} historyLoading={historyLoading} historyError={historyError} />

        <DemandHistory
          history={history}
          loading={historyLoading}
          error={historyError}
          days={historyDays}
          onChangeDays={setHistoryDays}
          selectedDeliveryDate={selectedDeliveryDate}
          onSelectDate={selectHistoryDate}
        />

        <section className="demand-workspace" aria-label="Demand forecast details">
          <div className="workspace-heading" id="demand-curve">
            <div><div className="section-kicker">FORECAST PROFILE</div><h2>Demand through the day</h2><p aria-live="polite">{selectedDeliveryDate ? `Forecast for ${formatDeliveryDate(selectedDeliveryDate)} · ${profileForecast?.source_selection === 'latest' ? 'Latest values per period' : 'Earliest published day-ahead values'} · ` : ''}Average national demand for each half-hour settlement period.</p></div>
            <div className="profile-date-controls">
              <span className="profile-date-label">Delivery date</span>
              <details
                ref={deliveryDatePicker}
                className="profile-date-picker"
                id="delivery-date-picker"
                aria-disabled={!forecast || loading}
                onClick={(event) => { if (!forecast || loading) event.preventDefault() }}
              >
                <summary className="profile-date-trigger" aria-disabled={!forecast || loading} aria-label={`Choose forecast delivery date${selectedDeliveryDate ? `, currently ${formatCompactDate(selectedDeliveryDate)}` : ''}`}>
                  <span>{selectedDeliveryDate ? formatCompactDate(selectedDeliveryDate) : 'Select date'}</span>
                  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 8 10 12l4-4" /></svg>
                </summary>
                <div className="profile-calendar-popover" id="delivery-date-calendar">
                  <CalendarBasic
                    key={selectedDeliveryDate ?? 'no-selected-date'}
                    className="delivery-calendar"
                    selected={selectedCalendarDate}
                    defaultMonth={selectedCalendarDate}
                    disabled={[
                      ...(minimumCalendarDate ? [{ before: minimumCalendarDate }] : []),
                      ...(maximumCalendarDate ? [{ after: maximumCalendarDate }] : []),
                    ]}
                    onSelect={(date) => {
                      if (!date) return
                      setSelectedDeliveryDate(formatIsoDate(date))
                      setSelectedStart(null)
                      setMissingOnly(false)
                      if (deliveryDatePicker.current) deliveryDatePicker.current.open = false
                    }}
                  />
                  <div className="profile-calendar-range">Available dates: {minimumDeliveryDate ? formatCompactDate(minimumDeliveryDate) : '—'} to {maximumDeliveryDate ? formatCompactDate(maximumDeliveryDate) : '—'}</div>
                </div>
              </details>
              {selectedDeliveryDate && forecast && selectedDeliveryDate !== forecast.delivery_date && <button className="profile-tomorrow-button" type="button" onClick={() => { if (deliveryDatePicker.current) deliveryDatePicker.current.open = false; setSelectedDeliveryDate(forecast.delivery_date); setSelectedStart(null); setMissingOnly(false) }}>{forecast.source_selection === 'earliest' ? 'Today' : 'Tomorrow'}</button>}
              {profileError && !isPrimarySelected && selectedDeliveryDate && <button className="profile-tomorrow-button" type="button" onClick={() => setSelectedDayRequestVersion((version) => version + 1)}>Retry forecast</button>}
            </div>
            <div className="chart-legend"><span><i />NDF demand <small>MW</small></span></div>
          </div>
          <DemandChart forecast={profileForecast ?? null} loading={profileLoading} error={profileError} selectedStart={selectedStart} onSelect={setSelectedStart} />
          <DemandPeriodsTable
            forecast={profileForecast ?? null}
            loading={profileLoading}
            error={profileError}
            selectedStart={selectedStart}
            onSelect={setSelectedStart}
            missingOnly={missingOnly}
            onToggleMissing={() => setMissingOnly((active) => !active)}
          />
        </section>

        <section className="source-note" id="source-notes">
          <div className="source-note-icon" aria-hidden="true">i</div>
          <div>
            <strong>How to read this forecast</strong>
            <p>Elexon NDF is the national demand forecast received from NGESO. It is average demand in MW per settlement period. The headline converts each half-hour period to MWh and sums the day; it is shown only when every expected period has a valid value. NDF includes transmission losses and excludes interconnector flows, station transformer demand, and pumped-storage demand.</p>
            <a href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/NDF" target="_blank" rel="noreferrer">Elexon NDF source documentation <span aria-hidden="true">↗</span></a>
          </div>
        </section>

        <footer className="page-footer"><span>WindScope</span><span>Data from Elexon Insights</span><a href="#top">Back to top ↑</a></footer>
      </div>
    </main>
  )
}

function formatDeliveryDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function getLondonDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

function offsetDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

function formatIsoDate(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatCompactDate(value: string): string {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
