from datetime import datetime, timedelta, timezone
from typing import Any

from pydantic import ValidationError

from app.schemas.generation import (
    FuelHHWindActual,
    QualityIssue,
    WindActualQualityReport,
    WindForecast,
    WindForecastQualityReport,
)


def _parse_utc_timestamp(value: Any) -> datetime:
    if not isinstance(value, str):
        raise ValueError("startTime must be a timestamp string")

    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("startTime must include a timezone")
    return parsed.astimezone(timezone.utc)


def assess_wind_actual_quality(
    records: list[dict[str, Any]],
    delivery_from: datetime,
    delivery_to: datetime,
    interval_minutes: int = 30,
) -> WindActualQualityReport:
    """Validate January WIND actuals and report coverage/data issues without filling gaps."""
    if delivery_from.tzinfo is None or delivery_to.tzinfo is None:
        raise ValueError("Delivery range boundaries must include timezones")
    if interval_minutes <= 0:
        raise ValueError("interval_minutes must be positive")

    start = delivery_from.astimezone(timezone.utc)
    end = delivery_to.astimezone(timezone.utc)
    if end <= start:
        raise ValueError("delivery_to must be later than delivery_from")

    duration_seconds = (end - start).total_seconds()
    interval_seconds = interval_minutes * 60
    if duration_seconds % interval_seconds:
        raise ValueError("Delivery range must contain a whole number of intervals")

    expected_count = int(duration_seconds // interval_seconds)
    expected_intervals = {
        start + timedelta(seconds=interval_seconds * index)
        for index in range(expected_count)
    }
    observed_intervals: set[datetime] = set()
    issues: list[QualityIssue] = []
    valid_count = 0
    null_generation_count = 0
    negative_generation_count = 0
    duplicate_count = 0
    seen_publications: set[tuple[datetime, datetime]] = set()

    for index, record in enumerate(records):
        try:
            start_time = _parse_utc_timestamp(record.get("startTime"))
        except (TypeError, ValueError) as exc:
            issues.append(QualityIssue(record_index=index, messages=[str(exc)]))
            continue

        if not start <= start_time < end:
            continue
        fuel_type = record.get("fuelType")
        if not isinstance(fuel_type, str):
            issues.append(
                QualityIssue(
                    record_index=index,
                    messages=["fuelType: missing or not a string"],
                )
            )
            continue
        if fuel_type != "WIND":
            continue

        observed_intervals.add(start_time)
        try:
            actual = FuelHHWindActual.model_validate(record)
        except ValidationError as exc:
            messages = [
                f"{'.'.join(str(part) for part in error['loc'])}: {error['msg']}"
                for error in exc.errors()
            ]
            issues.append(QualityIssue(record_index=index, messages=messages))
            continue

        valid_count += 1
        if actual.generation is None:
            null_generation_count += 1
        elif actual.generation < 0:
            negative_generation_count += 1

        publication_key = (actual.startTime, actual.publishTime)
        if publication_key in seen_publications:
            duplicate_count += 1
        else:
            seen_publications.add(publication_key)

    missing = sorted(expected_intervals - observed_intervals)
    return WindActualQualityReport(
        expected_interval_count=expected_count,
        observed_interval_count=len(observed_intervals),
        missing_intervals=missing,
        valid_record_count=valid_count,
        invalid_record_count=len(issues),
        null_generation_count=null_generation_count,
        negative_generation_count=negative_generation_count,
        duplicate_interval_publication_count=duplicate_count,
        issues=issues,
    )


def assess_wind_forecast_quality(
    records: list[dict[str, Any]],
) -> WindForecastQualityReport:
    """Validate selected WINDFOR records and report null or negative generation."""
    issues: list[QualityIssue] = []
    valid_count = 0
    null_generation_count = 0
    negative_generation_count = 0

    for index, record in enumerate(records):
        try:
            forecast = WindForecast.model_validate(record)
        except ValidationError as exc:
            messages = [
                f"{'.'.join(str(part) for part in error['loc'])}: {error['msg']}"
                for error in exc.errors()
            ]
            issues.append(QualityIssue(record_index=index, messages=messages))
            continue

        valid_count += 1
        if forecast.generation is None:
            null_generation_count += 1
        elif forecast.generation < 0:
            negative_generation_count += 1

    return WindForecastQualityReport(
        received_record_count=len(records),
        valid_record_count=valid_count,
        invalid_record_count=len(issues),
        null_generation_count=null_generation_count,
        negative_generation_count=negative_generation_count,
        issues=issues,
    )
