import type { AccuracyResponse } from '../types/api'

export default function AccuracyStats({ accuracy, loading }: { accuracy: AccuracyResponse | null; loading: boolean }) {
  const values = [
    { label: 'MAE', value: format(accuracy?.mae_mw ?? null, ' MW'), note: 'mean absolute error' },
    { label: 'RMSE', value: format(accuracy?.rmse_mw ?? null, ' MW'), note: 'root mean squared error' },
    { label: 'Bias', value: format(accuracy?.bias_mw ?? null, ' MW'), note: 'positive means over-forecast' },
    { label: 'MAPE', value: format(accuracy?.mape_percent ?? null, '%'), note: accuracy ? `${accuracy.mape_sample_count} nonzero actual hours` : 'percentage error' },
  ]

  return (
    <section className="stats" aria-label="Forecast accuracy">
      {values.map((item) => <div className="stat" key={item.label}>
        <span>{item.label}</span>
        <strong>{loading ? '…' : item.value}</strong>
        <small>{item.note}</small>
      </div>)}
    </section>
  )
}

function format(value: number | null, unit: string): string {
  return value === null ? '—' : `${value.toLocaleString('en-GB', { maximumFractionDigits: 2 })}${unit}`
}
