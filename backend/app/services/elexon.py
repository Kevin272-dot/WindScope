from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from app.core.config import settings
from app.services.data_quality import (
    assess_wind_actual_quality,
    assess_wind_forecast_quality,
)
from app.services.forecast_accuracy import (
    aggregate_half_hour_actuals,
    calculate_wind_forecast_accuracy,
)
from app.services.snapshot import save_january_snapshot

def _as_utc_query_value(value: datetime) -> str:
    """Format a timezone aware datetime as an ISO 8601 UTC query parameter value."""
    if value.tzinfo is None:
        raise ValueError("Datetime must be timezone aware")
    return (
        value.astimezone(timezone.utc).isoformat(timespec= "seconds").replace("+00:00", "Z")
    )
    
def fetch_wind_forecasts(published_from: datetime,published_to: datetime) -> list[dict[str,Any]]:
    """Fetch wind forecasts from the Elexon API."""
    if published_to < published_from:
         raise ValueError("publishedTo must be after publishedFrom")
    url = f"{settings.elexon_api_base_url.rstrip('/')}/datasets/WINDFOR/stream"
    params = {
        "publishDateTimeFrom": _as_utc_query_value(published_from),
        "publishDateTimeTo": _as_utc_query_value(published_to),
    }
    with httpx.Client(
    timeout=httpx.Timeout(90.0, connect=10.0)
) as client:
        response = client.get(url,params=params)
        response.raise_for_status()
        records  = response.json()
        
    if not isinstance(records,list):
            raise ValueError("Unexpected response format: expected a list of records")
    return records


def fetch_fuelhh_actuals(
    published_from: datetime,
    published_to: datetime,
) -> list[dict[str, Any]]:
    """Fetch raw FUELHH actual-generation records for a publication-time range."""
    if published_to < published_from:
        raise ValueError("publishedTo must be after publishedFrom")

    url = f"{settings.elexon_api_base_url.rstrip('/')}/datasets/FUELHH/stream"
    params = {
        "publishDateTimeFrom": _as_utc_query_value(published_from),
        "publishDateTimeTo": _as_utc_query_value(published_to),
    }

    with httpx.Client(timeout=httpx.Timeout(90.0, connect=10.0)) as client:
        response = client.get(url, params=params)
        response.raise_for_status()
        records = response.json()

    if not isinstance(records, list):
        raise ValueError("Unexpected FUELHH response format: expected a list of records")

    return records


def select_wind_actuals(
    records: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Select FUELHH records in the WIND fuel category without altering source fields."""
    if any(not isinstance(record.get("fuelType"), str) for record in records):
        raise ValueError("FUELHH record is missing a valid fuelType")

    return [record for record in records if record["fuelType"] == "WIND"]

def _parse_api_datetime(value: str) -> datetime:
       """Parse an ISO timestamp from Elexon and normalize it to UTC."""
       parsed = datetime.fromisoformat(value.replace("Z","+00:00"))
       
       if parsed.tzinfo is None:
              raise ValueError("Parsed datetime is not timezone aware")
       return parsed.astimezone(timezone.utc)


def select_wind_actuals_for_delivery_range(
    records: list[dict[str, Any]],
    delivery_from: datetime,
    delivery_to: datetime,
) -> list[dict[str, Any]]:
    """Keep WIND actuals whose delivery start is within a half-open time range."""
    if delivery_from.tzinfo is None or delivery_to.tzinfo is None:
        raise ValueError("Delivery range boundaries must include timezones")

    start_utc = delivery_from.astimezone(timezone.utc)
    end_utc = delivery_to.astimezone(timezone.utc)
    if end_utc <= start_utc:
        raise ValueError("delivery_to must be later than delivery_from")

    wind_records = select_wind_actuals(records)
    return [
        record
        for record in wind_records
        if start_utc <= _parse_api_datetime(record["startTime"]) < end_utc
    ]



def select_latest_forecast(records: list[dict[str,Any]],delivery_time: datetime,cutoff: datetime) -> dict[str,Any] | None:
    """"Select the latest forecast published before the cutoff for a given delievry time."""
    if delivery_time.tzinfo is None or cutoff.tzinfo is None:
        raise ValueError("Both delivery_time and cutoff must be timezone aware")
    
    delivery_utc = delivery_time.astimezone(timezone.utc)
    cutoff_utc = cutoff.astimezone(timezone.utc)
    
    eligible: list[tuple[datetime, dict[str,Any]]] = []
    
    for record in records:
        start_time = _parse_api_datetime(record["startTime"])
        published_time = _parse_api_datetime(record["publishTime"])
        
        if start_time == delivery_utc and published_time <= cutoff_utc:
            eligible.append((published_time, record))    
    if not eligible:
         return None
     
    last_published_time = max(published_time for published_time, _ in eligible)
    latest_records = [record for published_time,record in eligible if published_time == last_published_time]
   
    if len(latest_records) > 1:
        raise ValueError("Duplicate forecasts found for the same delivery and publication time")
    

    return latest_records[0]
    


if __name__ == "__main__":
    january_start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    february_start = datetime(2026, 2, 1, tzinfo=timezone.utc)
    forecast_publication_from = datetime(2025, 12, 31, tzinfo=timezone.utc)
    forecast_publication_to = datetime(2026, 1, 31, 23, 59, 59, tzinfo=timezone.utc)
    records = fetch_wind_forecasts(
        published_from=forecast_publication_from,
        published_to=forecast_publication_to,
    )
    january_forecasts = [
        record
        for record in records
        if january_start <= _parse_api_datetime(record["startTime"]) < february_start
    ]
    selected_forecasts: list[dict[str, Any]] = []
    for day in range(1, 32):
        delivery_date = datetime(2026, 1, day, tzinfo=timezone.utc)
        cutoff = (
            delivery_date
            - timedelta(days=1)
            + timedelta(hours=9, minutes=20)
        )

        selected_count = 0
        missing_hours = []

        for hour in range(24):
            delivery_time = datetime(
                2026, 1, day, hour, tzinfo=timezone.utc
            )
            selected = select_latest_forecast(
                records=records,
                delivery_time=delivery_time,
                cutoff=cutoff,
            )
            if selected is None:
                missing_hours.append(hour)
            else:
                selected_count += 1
                selected_forecasts.append(selected)
        print(
            f"{delivery_date.date()}: {selected_count}/24 hours selected; "
            f"missing hours: {missing_hours}"
        )

    forecast_quality = assess_wind_forecast_quality(selected_forecasts)
    print(
        "WINDFOR quality: "
        f"{forecast_quality.valid_record_count}/{forecast_quality.received_record_count} valid; "
        f"null generation={forecast_quality.null_generation_count}; "
        f"negative generation={forecast_quality.negative_generation_count}; "
        f"invalid records={forecast_quality.invalid_record_count}"
    )
    if forecast_quality.issues:
        print("WINDFOR validation issues:", forecast_quality.issues)

    actual_publication_from = datetime(2026, 1, 1, tzinfo=timezone.utc)
    actual_publication_to = datetime(2026, 2, 2, tzinfo=timezone.utc)
    actual_records = fetch_fuelhh_actuals(
        published_from=actual_publication_from,
        published_to=actual_publication_to,
    )
    actual_quality = assess_wind_actual_quality(
        records=actual_records,
        delivery_from=january_start,
        delivery_to=february_start,
    )
    print(
        "FUELHH WIND quality: "
        f"{actual_quality.observed_interval_count}/{actual_quality.expected_interval_count} "
        f"intervals observed; missing={len(actual_quality.missing_intervals)}; "
        f"null generation={actual_quality.null_generation_count}; "
        f"negative generation={actual_quality.negative_generation_count}; "
        f"duplicate interval publications={actual_quality.duplicate_interval_publication_count}; "
        f"invalid records={actual_quality.invalid_record_count}"
    )
    if actual_quality.missing_intervals:
        print("Missing FUELHH interval starts:", actual_quality.missing_intervals)
    if actual_quality.issues:
        print("FUELHH validation issues:", actual_quality.issues)

    january_wind_actuals = select_wind_actuals_for_delivery_range(
        records=actual_records,
        delivery_from=january_start,
        delivery_to=february_start,
    )
    print(
        f"FUELHH: {len(actual_records)} records retrieved; "
        f"{len(january_wind_actuals)} January WIND half-hourly actuals selected"
    )
    if january_wind_actuals:
        print("First January WIND actual:", january_wind_actuals[0])
        print("Last January WIND actual:", january_wind_actuals[-1])

    snapshot_path = save_january_snapshot(
        actuals=january_wind_actuals,
        forecasts=january_forecasts,
        actual_publication_from=actual_publication_from,
        actual_publication_to=actual_publication_to,
        forecast_publication_from=forecast_publication_from,
        forecast_publication_to=forecast_publication_to,
    )
    print(
        f"Saved Elexon snapshot: {snapshot_path} "
        f"({len(january_wind_actuals)} WIND actuals, "
        f"{len(january_forecasts)} forecast publications)"
    )

    hourly_actuals = aggregate_half_hour_actuals(
        january_wind_actuals, january_start, february_start
    )
    accuracy = calculate_wind_forecast_accuracy(
        selected_forecasts, hourly_actuals, january_start, february_start
    )
    print(
        "January forecast accuracy (errors are forecast minus actual): "
        f"paired={accuracy.paired_sample_count}/{accuracy.expected_hour_count} hours; "
        f"missing forecast={accuracy.missing_forecast_count}; "
        f"missing actual={accuracy.missing_actual_count}; "
        f"MAE={accuracy.mae_mw} MW; RMSE={accuracy.rmse_mw} MW; "
        f"bias={accuracy.bias_mw} MW; MAPE={accuracy.mape_percent}% "
        f"(n={accuracy.mape_sample_count}, zero actual excluded="
        f"{accuracy.mape_zero_actual_excluded_count})"
    )
