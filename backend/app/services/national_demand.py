"""Fetch Elexon NDF day-ahead forecasts and summarize daily energy demand."""

from datetime import date, datetime, time, timedelta, timezone
import math
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from app.core.config import settings
from app.schemas.demand import (
    DemandHistoryDay,
    DemandHistoryResponse,
    NationalDemandForecastResponse,
    NationalDemandInterval,
    NationalDemandSourceRecord,
)

LONDON = ZoneInfo("Europe/London")
DAY_AHEAD_CUTOFF = time(9, 20)


class DemandForecastDataError(ValueError):
    """Elexon returned malformed or duplicate national demand forecast data."""


def _as_utc_query_value(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace(
        "+00:00", "Z"
    )


def _fetch_day_ahead_stream(
    selection: str,
    from_time: datetime,
    to_time: datetime,
) -> list[dict[str, Any]]:
    if selection not in {"latest", "earliest"}:
        raise ValueError("selection must be latest or earliest")

    url = (
        f"{settings.elexon_api_base_url.rstrip('/')}/forecast/demand/"
        f"day-ahead/{selection}/stream"
    )
    params = {
        "from": _as_utc_query_value(from_time),
        "to": _as_utc_query_value(to_time),
    }
    with httpx.Client(timeout=httpx.Timeout(30.0, connect=10.0)) as client:
        response = client.get(url, params=params)
        response.raise_for_status()
        try:
            records = response.json()
        except ValueError as exc:
            raise DemandForecastDataError(
                "Elexon demand forecast response is not valid JSON"
            ) from exc

    if not isinstance(records, list) or not all(
        isinstance(row, dict) for row in records
    ):
        raise DemandForecastDataError("Unexpected Elexon demand forecast format")
    return records


def _parse_api_datetime(value: Any, field: str) -> datetime:
    if not isinstance(value, str):
        raise DemandForecastDataError(f"NDF {field} is missing or invalid")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise DemandForecastDataError(f"NDF {field} is invalid") from exc
    if parsed.tzinfo is None:
        raise DemandForecastDataError(f"NDF {field} is missing timezone information")
    return parsed.astimezone(timezone.utc)


def _expected_period_starts(delivery_date: date) -> list[datetime]:
    start_local = datetime.combine(delivery_date, time.min, tzinfo=LONDON)
    end_local = datetime.combine(
        delivery_date + timedelta(days=1), time.min, tzinfo=LONDON
    )
    start = start_local.astimezone(timezone.utc)
    end = end_local.astimezone(timezone.utc)
    starts: list[datetime] = []
    while start < end:
        starts.append(start)
        start += timedelta(minutes=30)
    return starts


def _source_record(record: dict[str, Any]) -> NationalDemandSourceRecord:
    start_time = _parse_api_datetime(record.get("startTime"), "startTime")
    publish_time = _parse_api_datetime(record.get("publishTime"), "publishTime")
    raw_demand = record.get("nationalDemand")
    if raw_demand is not None and (
        isinstance(raw_demand, bool)
        or not isinstance(raw_demand, (int, float))
        or not math.isfinite(float(raw_demand))
    ):
        raise DemandForecastDataError("NDF nationalDemand must be numeric or null")

    raw_transmission_demand = record.get("transmissionSystemDemand")
    if (
        isinstance(raw_transmission_demand, bool)
        or not isinstance(raw_transmission_demand, (int, float))
        or not math.isfinite(float(raw_transmission_demand))
    ):
        raise DemandForecastDataError(
            "NDF transmissionSystemDemand must be a finite numeric value"
        )

    boundary = record.get("boundary")
    if boundary not in (None, "N"):
        raise DemandForecastDataError("Expected national-boundary NDF data")
    settlement_date = record.get("settlementDate")
    if not isinstance(settlement_date, str):
        raise DemandForecastDataError("NDF settlementDate is missing or invalid")

    settlement_period = record.get("settlementPeriod")
    if (
        isinstance(settlement_period, bool)
        or not isinstance(settlement_period, int)
        or settlement_period < 1
    ):
        raise DemandForecastDataError("NDF settlementPeriod is invalid")

    try:
        source = NationalDemandSourceRecord(
            publishTime=publish_time,
            startTime=start_time,
            settlementDate=settlement_date,
            settlementPeriod=settlement_period,
            boundary=boundary,
            nationalDemand=(
                None if raw_demand is None else float(raw_demand)
            ),
            transmissionSystemDemand=float(raw_transmission_demand),
        )
    except (TypeError, ValueError) as exc:
        raise DemandForecastDataError(
            f"NDF source record is incomplete: {exc}"
        ) from exc
    return source


def _make_day_summary(
    delivery_date: date,
    records_by_start: dict[datetime, NationalDemandSourceRecord],
) -> DemandHistoryDay:
    expected_starts = _expected_period_starts(delivery_date)
    valid_values: list[tuple[datetime, float]] = []
    publish_times: list[datetime] = []

    for settlement_period, start_time in enumerate(expected_starts, start=1):
        source = records_by_start.get(start_time)
        if source is None:
            continue
        if source.settlementDate != delivery_date:
            raise DemandForecastDataError(
                "NDF settlement date does not match its delivery timestamp"
            )
        if source.settlementPeriod != settlement_period:
            raise DemandForecastDataError(
                "NDF settlement period does not match its delivery timestamp"
            )
        publish_times.append(source.publishTime)
        if source.nationalDemand is not None:
            valid_values.append((start_time, source.nationalDemand))

    expected_count = len(expected_starts)
    observed_count = len(valid_values)
    complete = expected_count > 0 and observed_count == expected_count
    peak = max(valid_values, key=lambda item: item[1]) if complete else None
    return DemandHistoryDay(
        delivery_date=delivery_date,
        forecast_publish_time=max(publish_times, default=None),
        expected_periods=expected_count,
        observed_periods=observed_count,
        missing_periods=expected_count - observed_count,
        total_energy_mwh=(
            math.fsum(value * 0.5 for _, value in valid_values)
            if complete
            else None
        ),
        peak_demand_mw=peak[1] if peak else None,
    )


def get_primary_national_demand_forecast(
    now: datetime | None = None,
) -> NationalDemandForecastResponse:
    """Return the current day-ahead profile, switching at 09:20 UK time."""
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        raise ValueError("now must be timezone aware")
    local_now = current.astimezone(LONDON)
    today = local_now.date()
    if local_now.time().replace(tzinfo=None) < DAY_AHEAD_CUTOFF:
        return _get_national_demand_forecast_for_date(today, selection="earliest")
    return _get_national_demand_forecast_for_date(
        today + timedelta(days=1), selection="latest"
    )


def get_national_demand_forecast_for_date(
    delivery_date: date,
    now: datetime | None = None,
) -> NationalDemandForecastResponse:
    """Return the day-ahead NDF profile for a date in the available history window."""
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        raise ValueError("now must be timezone aware")
    today = current.astimezone(LONDON).date()
    if delivery_date < today - timedelta(days=30) or delivery_date > today + timedelta(days=1):
        raise ValueError("delivery_date must be within the previous 30 days or tomorrow")
    selection = "latest" if delivery_date == today + timedelta(days=1) else "earliest"
    return _get_national_demand_forecast_for_date(delivery_date, selection)


def _get_national_demand_forecast_for_date(
    delivery_date: date,
    selection: str,
) -> NationalDemandForecastResponse:
    expected_starts = _expected_period_starts(delivery_date)
    expected_set = set(expected_starts)
    period_by_start = {
        start_time: period
        for period, start_time in enumerate(expected_starts, start=1)
    }
    records = _fetch_day_ahead_stream(
        selection,
        expected_starts[0],
        expected_starts[-1] + timedelta(minutes=30),
    )

    records_by_start: dict[datetime, NationalDemandSourceRecord] = {}
    for raw_record in records:
        if raw_record.get("settlementDate") != delivery_date.isoformat():
            continue
        source = _source_record(raw_record)
        if source.startTime not in expected_set:
            continue
        expected_period = period_by_start[source.startTime]
        if source.settlementPeriod != expected_period:
            raise DemandForecastDataError(
                "NDF settlement period does not match its delivery timestamp"
            )
        if source.startTime in records_by_start:
            raise DemandForecastDataError(
                "Duplicate NDF values found for a settlement period"
            )
        records_by_start[source.startTime] = source

    intervals: list[NationalDemandInterval] = []
    valid_values: list[tuple[datetime, float]] = []
    for period, start_time in enumerate(expected_starts, start=1):
        source = records_by_start.get(start_time)
        demand_mw = source.nationalDemand if source else None
        if demand_mw is not None:
            valid_values.append((start_time, demand_mw))
        intervals.append(
            NationalDemandInterval(
                start_time=start_time,
                settlement_period=period,
                demand_mw=demand_mw,
                source_record=source,
            )
        )

    expected_count = len(expected_starts)
    observed_count = len(valid_values)
    complete = expected_count > 0 and observed_count == expected_count
    peak = max(valid_values, key=lambda item: item[1]) if complete else None
    return NationalDemandForecastResponse(
        delivery_date=delivery_date,
        source_selection=selection,
        forecast_publish_time=max(
            (source.publishTime for source in records_by_start.values()),
            default=None,
        ),
        expected_periods=expected_count,
        observed_periods=observed_count,
        missing_periods=expected_count - observed_count,
        total_energy_mwh=(
            math.fsum(value * 0.5 for _, value in valid_values) if complete else None
        ),
        peak_demand_mw=peak[1] if peak else None,
        peak_period_start=peak[0] if peak else None,
        intervals=intervals,
    )


def get_national_demand_history(
    days: int = 20,
    now: datetime | None = None,
) -> DemandHistoryResponse:
    """Return daily energy totals from Elexon's earliest NDF values by period."""
    if not 10 <= days <= 30:
        raise ValueError("days must be between 10 and 30")
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        raise ValueError("now must be timezone aware")
    today = current.astimezone(LONDON).date()
    first_date = today - timedelta(days=days)
    first_start = datetime.combine(first_date, time.min, tzinfo=LONDON)
    today_start = datetime.combine(today, time.min, tzinfo=LONDON)
    records = _fetch_day_ahead_stream(
        "earliest",
        first_start.astimezone(timezone.utc),
        today_start.astimezone(timezone.utc),
    )

    expected_dates = [first_date + timedelta(days=offset) for offset in range(days)]
    expected_by_date = {
        delivery_date: set(_expected_period_starts(delivery_date))
        for delivery_date in expected_dates
    }
    records_by_date: dict[date, dict[datetime, NationalDemandSourceRecord]] = {
        delivery_date: {} for delivery_date in expected_dates
    }

    for raw_record in records:
        raw_date = raw_record.get("settlementDate")
        if not isinstance(raw_date, str):
            raise DemandForecastDataError("NDF settlementDate is missing or invalid")
        try:
            delivery_date = date.fromisoformat(raw_date)
        except ValueError as exc:
            raise DemandForecastDataError("NDF settlementDate is invalid") from exc
        if delivery_date not in records_by_date:
            continue

        source = _source_record(raw_record)
        if source.startTime not in expected_by_date[delivery_date]:
            continue
        if source.startTime in records_by_date[delivery_date]:
            raise DemandForecastDataError(
                "Duplicate earliest NDF values found for a settlement period"
            )
        records_by_date[delivery_date][source.startTime] = source

    daily = [
        _make_day_summary(delivery_date, records_by_date[delivery_date])
        for delivery_date in expected_dates
    ]
    return DemandHistoryResponse(
        requested_days=days,
        start_date=first_date,
        end_date=today - timedelta(days=1),
        days=daily,
    )
