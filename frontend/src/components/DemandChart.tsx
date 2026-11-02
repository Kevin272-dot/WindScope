import { useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { NationalDemandForecastResponse } from '../types/api'

type Props = {
  forecast: NationalDemandForecastResponse | null
  loading: boolean
  error: string | null
  selectedStart: string | null
  onSelect: (start: string | null) => void
}

export default function DemandChart({ forecast, loading, error, selectedStart, onSelect }: Props) {
  const [hoveredStart, setHoveredStart] = useState<string | null>(null)
  const points = forecast?.intervals ?? []
  const hasValues = points.some((point) => point.demand_mw !== null)
  const focusStart = hoveredStart ?? selectedStart
  const selectedPeriod = points.find((point) => point.start_time === focusStart)?.settlement_period

  return (
    <div className="demand-chart-card">
      <div className="demand-chart-meta">
        <span>Average demand <strong>MW</strong></span>
        <span className="chart-timezone">Click a point to pin it · <strong>Europe/London</strong></span>
      </div>
      <div className="demand-chart-plot">
        {loading ? <div className="chart-state"><span className="spinner" /><strong>Loading the day-ahead forecast</strong></div> : error ? <div className="chart-state"><strong>Forecast curve unavailable</strong><span>{error}</span></div> : hasValues ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={points}
              margin={{ top: 13, right: 18, left: 4, bottom: 0 }}
              onMouseMove={(state) => {
                const point = state?.activePayload?.[0]?.payload as typeof points[number] | undefined
                setHoveredStart(point?.start_time ?? null)
              }}
              onMouseLeave={() => setHoveredStart(null)}
              onClick={(state) => {
                const point = state?.activePayload?.[0]?.payload as typeof points[number] | undefined
                if (point) onSelect(selectedStart === point.start_time ? null : point.start_time)
              }}
            >
              <defs><linearGradient id="demandFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#76a88c" stopOpacity={0.24} /><stop offset="100%" stopColor="#76a88c" stopOpacity={0.015} /></linearGradient></defs>
              <CartesianGrid vertical={false} stroke="#e9eeeb" strokeDasharray="2 5" />
              <XAxis
                dataKey="settlement_period"
                type="number"
                domain={['dataMin', 'dataMax']}
                tick={{ fill: '#68776e', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                minTickGap={28}
                tickFormatter={(value: number) => `P${value}`}
                dy={9}
              />
              <YAxis tick={{ fill: '#68776e', fontSize: 12 }} axisLine={false} tickLine={false} width={68} tickFormatter={(value: number) => value.toLocaleString('en-GB')} domain={['auto', 'auto']} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const point = payload[0].payload as typeof points[number]
                return <div className="demand-tooltip">
                  <strong>Period {point.settlement_period} <span>·</span> {formatLocal(point.start_time)}</strong>
                  <span className="tooltip-demand">Demand <b>{formatDemand(point.demand_mw)}</b></span>
                  <small>{formatUtc(point.start_time)}</small>
                </div>
              }} />
              {selectedPeriod !== undefined && <ReferenceLine x={selectedPeriod} stroke="#627d6e" strokeDasharray="3 3" />}
              <Area type="linear" dataKey="demand_mw" name="National demand" stroke="#39775a" strokeWidth={2.3} fill="url(#demandFill)" activeDot={{ r: 4, fill: '#39775a', stroke: '#fff', strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : <div className="chart-state"><strong>No published demand periods</strong><span>Source gaps remain blank; this chart does not fill missing periods.</span></div>}
      </div>
      {forecast && forecast.missing_periods > 0 && <div className="chart-gap-note">Gaps in the curve represent {forecast.missing_periods} missing or null source periods.</div>}
      {forecast && <div className="chart-range-labels"><span>First period · {formatLocal(forecast.intervals[0]?.start_time)}</span><span>Last period · {formatLocal(forecast.intervals[forecast.intervals.length - 1]?.start_time)}</span></div>}
    </div>
  )
}

function formatDemand(value: number | null): string {
  return value === null ? 'Unavailable' : `${value.toLocaleString('en-GB', { maximumFractionDigits: 0 })} MW`
}

function formatLocal(value: string | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/London', timeZoneName: 'short' })
}

function formatUtc(value: string): string {
  return `${new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' })} UTC · Elexon startTime`
}
