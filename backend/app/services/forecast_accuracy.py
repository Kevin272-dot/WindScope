"""Hourly comparison of Elexon WINDFOR forecasts with FUELHH WIND actuals."""

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from math import sqrt
from typing import Any

from app.schemas.generation import HourlyWindActual, WindForecastAccuracyReport
from app.services.data_quality import _parse_utc_timestamp


def aggregate_half_hour_actuals(
    records: list[dict[str, Any]], delivery_from: datetime, delivery_to: datetime
) -> list[HourlyWindActual]:
    """Average the two FUELHH half-hour MW values into each hourly MW actual.

    An hour is null unless both expected half-hour intervals have exactly one
    valid WIND record. Source records are not modified; missing/duplicate data
    is not repaired or imputed.
    """
    if delivery_from.tzinfo is None or delivery_to.tzinfo is None:
        raise ValueError("Delivery boundaries must include a timezone")
    start = delivery_from.astimezone(timezone.utc)
    end = delivery_to.astimezone(timezone.utc)
    if end <= start or start.minute or start.second or end.minute or end.second:
        raise ValueError("Delivery range must be a positive whole-hour range")

    intervals: dict[datetime, list[float | None]] = defaultdict(list)
    for record in records:
        if record.get("fuelType") != "WIND":
            continue
        try:
            interval_start = _parse_utc_timestamp(record.get("startTime"))
        except (TypeError, ValueError):
            continue
        if not start <= interval_start < end:
            continue
        generation = record.get("generation")
        value = (
            float(generation)
            if isinstance(generation, (int, float))
            and not isinstance(generation, bool)
            else None
        )
        hour = interval_start.replace(minute=0, second=0, microsecond=0)
        intervals[hour].append(value)

    result: list[HourlyWindActual] = []
    hour = start
    while hour < end:
        half_hours = intervals.get(hour, [])
        actual = (
            (half_hours[0] + half_hours[1]) / 2
            if len(half_hours) == 2
            and half_hours[0] is not None
            and half_hours[1] is not None
            else None
        )
        result.append(
            HourlyWindActual(
                startTime=hour,
                generation=actual,
                source_interval_count=len(half_hours),
            )
        )
        hour += timedelta(hours=1)
    return result


def calculate_wind_forecast_accuracy(
    forecasts: list[dict[str, Any]], actuals: list[HourlyWindActual],
    delivery_from: datetime, delivery_to: datetime,
) -> WindForecastAccuracyReport:
    """Calculate metrics over paired hours; bias is forecast minus actual."""
    if delivery_from.tzinfo is None or delivery_to.tzinfo is None:
        raise ValueError("Delivery boundaries must include a timezone")
    start = delivery_from.astimezone(timezone.utc)
    end = delivery_to.astimezone(timezone.utc)
    if end <= start or start.minute or start.second or end.minute or end.second:
        raise ValueError("Delivery range must be a positive whole-hour range")

    forecast_by_hour: dict[datetime, list[float | None]] = defaultdict(list)
    for record in forecasts:
        try:
            timestamp = _parse_utc_timestamp(record.get("startTime"))
        except (TypeError, ValueError):
            continue
        if start <= timestamp < end:
            raw = record.get("generation")
            value = float(raw) if isinstance(raw, (int, float)) and not isinstance(raw, bool) else None
            forecast_by_hour[timestamp].append(value)

    actual_by_hour = {item.startTime.astimezone(timezone.utc): item.generation for item in actuals}
    errors: list[float] = []
    absolute_percentage_errors: list[float] = []
    missing_forecast = missing_actual = zero_actual = 0
    expected = 0
    hour = start
    while hour < end:
        expected += 1
        candidates = forecast_by_hour.get(hour, [])
        forecast = candidates[0] if len(candidates) == 1 else None
        actual = actual_by_hour.get(hour)
        if forecast is None:
            missing_forecast += 1
        if actual is None:
            missing_actual += 1
        if forecast is not None and actual is not None:
            error = forecast - actual
            errors.append(error)
            if actual == 0:
                zero_actual += 1
            else:
                absolute_percentage_errors.append(abs(error / actual) * 100)
        hour += timedelta(hours=1)

    count = len(errors)
    return WindForecastAccuracyReport(
        expected_hour_count=expected,
        paired_sample_count=count,
        missing_forecast_count=missing_forecast,
        missing_actual_count=missing_actual,
        mae_mw=sum(abs(error) for error in errors) / count if count else None,
        rmse_mw=sqrt(sum(error * error for error in errors) / count) if count else None,
        bias_mw=sum(errors) / count if count else None,
        mape_percent=(sum(absolute_percentage_errors) / len(absolute_percentage_errors)
                      if absolute_percentage_errors else None),
        mape_sample_count=len(absolute_percentage_errors),
        mape_zero_actual_excluded_count=zero_actual,
    )
