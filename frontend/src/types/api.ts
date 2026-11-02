export type SourceStatus = {
  status: "ok";
  service: string;
  source_datasets: Array<"FUELHH" | "WINDFOR" | "NDF">;
};
export type AccuracyResponse = {
  delivery_date: string;
  cutoff: string;
  expected_hours: number;
  paired_hours: number;
  missing_forecast_hours: number;
  missing_actual_hours: number;
  mae_mw: number | null;
  rmse_mw: number | null;
  bias_mw: number | null;
  mape_percent: number | null;
  mape_sample_count: number;
  mape_zero_actual_excluded_count: number;
};

export type IntervalPoint = {
  start_time: string;
  forecast_publish_time: string | null;
  forecast_mw: number | null;
  actual_mw: number | null;
  error_mw: number | null;
  actual_source_intervals: number;
};

export type IntervalsResponse = {
  delivery_date: string;
  cutoff: string;
  expected_hours: number;
  intervals: IntervalPoint[];
};

export type NationalDemandSourceRecord = {
  publishTime: string;
  startTime: string;
  settlementDate: string;
  settlementPeriod: number;
  boundary: string | null;
  nationalDemand: number | null;
  transmissionSystemDemand: number;
};

export type NationalDemandInterval = {
  start_time: string;
  settlement_period: number;
  demand_mw: number | null;
  source_record: NationalDemandSourceRecord | null;
};

export type NationalDemandForecastResponse = {
  delivery_date: string;
  source_selection: "earliest" | "latest";
  forecast_publish_time: string | null;
  expected_periods: number;
  observed_periods: number;
  missing_periods: number;
  total_energy_mwh: number | null;
  peak_demand_mw: number | null;
  peak_period_start: string | null;
  intervals: NationalDemandInterval[];
};

export type DemandHistoryDay = {
  delivery_date: string;
  forecast_publish_time: string | null;
  expected_periods: number;
  observed_periods: number;
  missing_periods: number;
  total_energy_mwh: number | null;
  peak_demand_mw: number | null;
};

export type DemandHistoryResponse = {
  requested_days: number;
  start_date: string;
  end_date: string;
  days: DemandHistoryDay[];
};
