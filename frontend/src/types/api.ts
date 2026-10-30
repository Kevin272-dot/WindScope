export type SourceStatus = {
  status: "ok";
  service: string;
  source_datasets: Array<"FUELHH" | "WINDFOR">;
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
