"""Read the local Elexon snapshot and prepare daily API analytics."""

import json
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from app.schemas.analytics import (
    AccuracyResponse,
    IntervalPoint,
    IntervalsResponse,
)
from app.schemas.generation import HourlyWindActual
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


def _load_snapshot() -> dict[str, Any]:
    path: Path = january_snapshot_path()
    if not path.is_file():
        raise SnapshotUnavailableError(
            f"January data snapshot not found at {path}. Run the ingestion "
            "process first to create data/snapshots/january-2026.json."
        )

    try:
        with path.open("r", encoding="utf-8") as file:
            snapshot = json.load(file)
    except (OSError, json.JSONDecodeError) as exc:
        raise SnapshotUnavailableError(f"Could not read data snapshot: {exc}") from exc

    if (
        not isinstance(snapshot, dict)
        or not isinstance(snapshot.get("actuals"), list)
        or not isinstance(snapshot.get("forecasts"), list)
    ):
        raise SnapshotUnavailableError(
            "Snapshot must be a JSON object containing actuals and forecasts arrays."
        )
    if not all(
        isinstance(record, dict)
        for record in snapshot["actuals"] + snapshot["forecasts"]
    ):
        raise SnapshotUnavailableError("Snapshot records must be JSON objects.")
    return snapshot


def _get_daily_series(
    delivery_date: date,
    cutoff_time: time,
) -> tuple[
    datetime,
    datetime,
    datetime,
    list[dict[str, Any]],
    list[HourlyWindActual],
]:
    """Return one consistent selected forecast and actual series for a day."""
    if delivery_date.year != 2026 or delivery_date.month != 1:
        raise ValueError("Only delivery dates in January 2026 are supported.")
    if cutoff_time.tzinfo is not None:
        raise ValueError("cutoff_time must be a UK local clock time without a timezone.")

    london = ZoneInfo("Europe/London")
    day_start_local = datetime.combine(delivery_date, time.min, tzinfo=london)
    day_end_local = day_start_local + timedelta(days=1)
    delivery_start = day_start_local.astimezone(timezone.utc)
    delivery_end = day_end_local.astimezone(timezone.utc)
    cutoff = datetime.combine(
        delivery_date - timedelta(days=1), cutoff_time, tzinfo=london
    ).astimezone(timezone.utc)

    snapshot = _load_snapshot()
    forecast_records = snapshot["forecasts"]
    actual_records = snapshot["actuals"]

    selected_forecasts: list[dict[str, Any]] = []
    current_hour = delivery_start
    while current_hour < delivery_end:
        try:
            selected = select_latest_forecast(
                forecast_records,
                delivery_time=current_hour,
                cutoff=cutoff,
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise SnapshotUnavailableError(
                f"Forecast snapshot contains an invalid record: {exc}"
            ) from exc
        if selected is not None:
            selected_forecasts.append(selected)
        current_hour += timedelta(hours=1)

    try:
        day_actual_records = select_wind_actuals_for_delivery_range(
            actual_records,
            delivery_from=delivery_start,
            delivery_to=delivery_end,
        )
        hourly_actuals = aggregate_half_hour_actuals(
            day_actual_records,
            delivery_from=delivery_start,
            delivery_to=delivery_end,
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise SnapshotUnavailableError(
            f"Actual snapshot contains an invalid record: {exc}"
        ) from exc

    return (
        cutoff,
        delivery_start,
        delivery_end,
        selected_forecasts,
        hourly_actuals,
    )


def get_daily_accuracy(delivery_date: date, cutoff_time: time) -> AccuracyResponse:
    """Calculate one January delivery day's accuracy using a pre-cutoff forecast."""
    cutoff, start, end, forecasts, actuals = _get_daily_series(
        delivery_date, cutoff_time
    )
    report = calculate_wind_forecast_accuracy(forecasts, actuals, start, end)

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


def get_daily_intervals(
    delivery_date: date,
    cutoff_time: time,
) -> IntervalsResponse:
    """Return one chart point per expected delivery hour, preserving gaps."""
    cutoff, start, end, selected_forecasts, hourly_actuals = _get_daily_series(
        delivery_date, cutoff_time
    )

    forecast_by_hour: dict[datetime, dict[str, Any]] = {}
    for record in selected_forecasts:
        try:
            forecast_start = datetime.fromisoformat(
                record["startTime"].replace("Z", "+00:00")
            ).astimezone(timezone.utc)
        except (KeyError, TypeError, ValueError) as exc:
            raise SnapshotUnavailableError(
                f"Selected forecast has an invalid startTime: {exc}"
            ) from exc
        forecast_by_hour[forecast_start] = record

    actual_by_hour = {
        actual.startTime.astimezone(timezone.utc): actual
        for actual in hourly_actuals
    }
    points: list[IntervalPoint] = []
    current_hour = start

    while current_hour < end:
        forecast = forecast_by_hour.get(current_hour)
        actual = actual_by_hour.get(current_hour)

        raw_forecast = forecast.get("generation") if forecast else None
        forecast_mw = (
            float(raw_forecast)
            if isinstance(raw_forecast, (int, float))
            and not isinstance(raw_forecast, bool)
            else None
        )
        actual_mw = actual.generation if actual else None
        error_mw = (
            forecast_mw - actual_mw
            if forecast_mw is not None and actual_mw is not None
            else None
        )

        publish_time = None
        if forecast is not None:
            try:
                publish_time = datetime.fromisoformat(
                    forecast["publishTime"].replace("Z", "+00:00")
                )
            except (KeyError, TypeError, ValueError) as exc:
                raise SnapshotUnavailableError(
                    f"Selected forecast has an invalid publishTime: {exc}"
                ) from exc

        points.append(
            IntervalPoint(
                start_time=current_hour,
                forecast_publish_time=publish_time,
                forecast_mw=forecast_mw,
                actual_mw=actual_mw,
                error_mw=error_mw,
                actual_source_intervals=(actual.source_interval_count if actual else 0),
            )
        )
        current_hour += timedelta(hours=1)

    return IntervalsResponse(
        delivery_date=delivery_date,
        cutoff=cutoff,
        expected_hours=len(points),
        intervals=points,
    )
