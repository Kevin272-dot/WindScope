from datetime import date, time

import httpx
from fastapi import APIRouter, HTTPException, Query, Response

from app.schemas.analytics import AccuracyResponse, IntervalsResponse
from app.schemas.demand import DemandHistoryResponse, NationalDemandForecastResponse
from app.schemas.health import HealthResponse
from app.services.analytics import (
    SnapshotUnavailableError,
    get_daily_accuracy,
    get_daily_intervals,
)
from app.services.national_demand import (
    DemandForecastDataError,
    get_national_demand_history,
    get_national_demand_forecast_for_date,
    get_primary_national_demand_forecast,
)

router = APIRouter(prefix="/api")


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="windscope-api",
        source_datasets=["FUELHH", "WINDFOR", "NDF"],
    )


@router.get("/demand/primary", response_model=NationalDemandForecastResponse)
@router.get(
    "/demand/tomorrow",
    response_model=NationalDemandForecastResponse,
    include_in_schema=False,
)
def primary_demand(response: Response) -> NationalDemandForecastResponse:
    response.headers["Cache-Control"] = "no-store"
    try:
        return get_primary_national_demand_forecast()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail="Could not retrieve the Elexon National Demand Forecast.",
        ) from exc
    except DemandForecastDataError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/demand/day", response_model=NationalDemandForecastResponse)
def demand_day(
    response: Response,
    delivery_date: date = Query(...),
) -> NationalDemandForecastResponse:
    response.headers["Cache-Control"] = "no-store"
    try:
        return get_national_demand_forecast_for_date(delivery_date)
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail="Could not retrieve the selected Elexon NDF forecast.",
        ) from exc
    except DemandForecastDataError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/demand/history", response_model=DemandHistoryResponse)
def demand_history(
    response: Response,
    days: int = Query(default=20, ge=10, le=30),
) -> DemandHistoryResponse:
    response.headers["Cache-Control"] = "no-store"
    try:
        return get_national_demand_history(days=days)
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail="Could not retrieve Elexon day-ahead demand history.",
        ) from exc
    except DemandForecastDataError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/accuracy", response_model=AccuracyResponse)
def accuracy(
    delivery_date: date = Query(..., description="Delivery date in January 2026"),
    cutoff_time: time = Query(
        default=time(9, 20),
        description="UK local decision cutoff on the day before delivery",
    ),
) -> AccuracyResponse:
    try:
        return get_daily_accuracy(delivery_date, cutoff_time)
    except SnapshotUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/intervals", response_model=IntervalsResponse)
def intervals(
    delivery_date: date = Query(..., description="Delivery date in January 2026"),
    cutoff_time: time = Query(
        default=time(9, 20),
        description="UK local decision cutoff on the day before delivery",
    ),
) -> IntervalsResponse:
    try:
        return get_daily_intervals(delivery_date, cutoff_time)
    except SnapshotUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
