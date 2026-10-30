"""Read the local Elexon snapshot and prepare daily API analytics."""

import json
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from app.schemas.analytics import AccuracyResponse
from app.services.elexon import (
    select_latest_forecast,
    select_wind_actuals_for_delivery_range,
)
from app.services.forecast_accuracy import (
    aggregate_half_hour_actuals,
    calculate_wind_forecast_accuracy,
)
from app.services.snapshot import january_snapshot_path


class SnapshotUnavailableError(Exception):
    """The validated local January data snapshot is missing or unreadable."""


def _snapshot_path() -> Path:
    return january_snapshot_path()


def _load_snapshot() -> dict[str, Any]:
    path = _snapshot_path()
    if not path.is_file():
        raise SnapshotUnavailableError(
            f"January data snapshot not found at {path}. Run the verified ingestion "
            "process and save its records as data/snapshots/january-2026.json."
        )
    try:
        with path.open("r", encoding="utf-8") as file:
            snapshot = json.load(file)
    except (OSError, json.JSONDecodeError) as exc:
        raise SnapshotUnavailableError(f"Could not read data snapshot: {exc}") from exc
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get("actuals"), list) or not isinstance(snapshot.get("forecasts"), list):
        raise SnapshotUnavailableError(
            "Snapshot must be a JSON object containing actuals and forecasts arrays."
        )
    return snapshot


def get_daily_accuracy(delivery_date: date, cutoff_time: time) -> AccuracyResponse:
    """Calculate one January delivery day's accuracy using a pre-cutoff forecast."""
    if delivery_date.year != 2026 or delivery_date.month != 1:
        raise ValueError("Only delivery dates in January 2026 are supported")
    if cutoff_time.tzinfo is not None:
        raise ValueError("cutoff_time must be a UK local clock time without a timezone")

    london = ZoneInfo("Europe/London")
    delivery_start_local = datetime.combine(delivery_date, time.min, tzinfo=london)
    delivery_end_local = delivery_start_local + timedelta(days=1)
    delivery_start = delivery_start_local.astimezone(timezone.utc)
    delivery_end = delivery_end_local.astimezone(timezone.utc)
    cutoff = datetime.combine(
        delivery_date - timedelta(days=1), cutoff_time, tzinfo=london
    ).astimezone(timezone.utc)

    snapshot = _load_snapshot()
    raw_actuals = snapshot["actuals"]
    raw_forecasts = snapshot["forecasts"]
    if not all(isinstance(item, dict) for item in raw_actuals + raw_forecasts):
        raise SnapshotUnavailableError("Snapshot records must be JSON objects")

    day_forecasts: list[dict[str, Any]] = []
    current_hour = delivery_start
    while current_hour < delivery_end:
        selected = select_latest_forecast(raw_forecasts, current_hour, cutoff)
        if selected is not None:
            day_forecasts.append(selected)
        current_hour += timedelta(hours=1)

    # Use the shared timestamp-aware selector; keep FUELHH fuel filtering centralized.
    day_actuals = select_wind_actuals_for_delivery_range(
        raw_actuals, delivery_start, delivery_end
    )
    hourly_actuals = aggregate_half_hour_actuals(
        day_actuals, delivery_start, delivery_end
    )
    report = calculate_wind_forecast_accuracy(
        day_forecasts, hourly_actuals, delivery_start, delivery_end
    )

    return AccuracyResponse(
        delivery_date=delivery_date,
        cutoff=cutoff,
        expected_hours=report.expected_hour_count,
        paired_hours=report.paired_sample_count,
        missing_forecast_hours=report.missing_forecast_count,
        missing_actual_hours=report.missing_actual_count,
        mae_mw=report.mae_mw,
        rmse_mw=report.rmse_mw,
        bias_mw=report.bias_mw,
        mape_percent=report.mape_percent,
        mape_sample_count=report.mape_sample_count,
        mape_zero_actual_excluded_count=report.mape_zero_actual_excluded_count,
    )
