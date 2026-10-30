from datetime import datetime, timezone
import unittest

from app.services.forecast_accuracy import (
    aggregate_half_hour_actuals,
    calculate_wind_forecast_accuracy,
)


UTC = timezone.utc
START = datetime(2026, 1, 1, tzinfo=UTC)
END = datetime(2026, 1, 1, 3, tzinfo=UTC)


def actual(start: str, value: float, fuel: str = "WIND") -> dict:
    return {"startTime": start, "generation": value, "fuelType": fuel}


def forecast(start: str, value: float) -> dict:
    return {"startTime": start, "generation": value, "publishTime": "2025-12-31T09:00:00Z"}


class ForecastAccuracyTests(unittest.TestCase):
    def test_half_hour_aggregation_requires_both_source_intervals(self):
        records = [
            actual("2026-01-01T00:00:00Z", 10),
            actual("2026-01-01T00:30:00Z", 20),
            actual("2026-01-01T01:00:00Z", 30),
            actual("2026-01-01T01:30:00Z", 50),
            actual("2026-01-01T02:00:00Z", 100),
            actual("2026-01-01T02:30:00Z", 100, fuel="GAS"),
        ]
        hourly = aggregate_half_hour_actuals(records, START, END)
        self.assertEqual([item.generation for item in hourly], [15, 40, None])
        self.assertEqual([item.source_interval_count for item in hourly], [2, 2, 1])
        self.assertEqual(records[0]["generation"], 10)  # raw source remains untouched

    def test_metrics_use_paired_hours_and_exclude_zero_actual_from_mape(self):
        actual_records = [
            actual("2026-01-01T00:00:00Z", 10), actual("2026-01-01T00:30:00Z", 10),
            actual("2026-01-01T01:00:00Z", 0), actual("2026-01-01T01:30:00Z", 0),
            actual("2026-01-01T02:00:00Z", 20),  # missing second half-hour -> missing hour
        ]
        hourly = aggregate_half_hour_actuals(actual_records, START, END)
        forecasts = [
            forecast("2026-01-01T00:00:00Z", 12),
            forecast("2026-01-01T01:00:00Z", 3),
            forecast("2026-01-01T02:00:00Z", 40),
        ]
        report = calculate_wind_forecast_accuracy(forecasts, hourly, START, END)
        self.assertEqual(report.paired_sample_count, 2)
        self.assertEqual(report.missing_actual_count, 1)
        self.assertEqual(report.mae_mw, 2.5)
        self.assertAlmostEqual(report.rmse_mw, (6.5) ** 0.5)
        self.assertEqual(report.bias_mw, 2.5)
        self.assertEqual(report.mape_sample_count, 1)
        self.assertEqual(report.mape_zero_actual_excluded_count, 1)
        self.assertEqual(report.mape_percent, 20)

    def test_no_pairs_produce_null_metrics_not_zero(self):
        hourly = aggregate_half_hour_actuals([], START, END)
        report = calculate_wind_forecast_accuracy([], hourly, START, END)
        self.assertEqual(report.paired_sample_count, 0)
        self.assertIsNone(report.mae_mw)
        self.assertIsNone(report.rmse_mw)
        self.assertIsNone(report.bias_mw)
        self.assertIsNone(report.mape_percent)


if __name__ == "__main__":
    unittest.main()
