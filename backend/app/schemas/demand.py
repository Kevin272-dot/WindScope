from datetime import date, datetime

from typing import Literal

from pydantic import BaseModel


class NationalDemandSourceRecord(BaseModel):
    """One row from Elexon's day-ahead demand forecast response."""

    publishTime: datetime
    startTime: datetime
    settlementDate: date
    settlementPeriod: int
    boundary: str | None
    nationalDemand: float | None
    transmissionSystemDemand: float


class NationalDemandInterval(BaseModel):
    start_time: datetime
    settlement_period: int
    demand_mw: float | None
    source_record: NationalDemandSourceRecord | None


class NationalDemandForecastResponse(BaseModel):
    delivery_date: date
    source_selection: Literal["earliest", "latest"]
    forecast_publish_time: datetime | None
    expected_periods: int
    observed_periods: int
    missing_periods: int
    total_energy_mwh: float | None
    peak_demand_mw: float | None
    peak_period_start: datetime | None
    intervals: list[NationalDemandInterval]


class DemandHistoryDay(BaseModel):
    delivery_date: date
    forecast_publish_time: datetime | None
    expected_periods: int
    observed_periods: int
    missing_periods: int
    total_energy_mwh: float | None
    peak_demand_mw: float | None


class DemandHistoryResponse(BaseModel):
    requested_days: int
    start_date: date
    end_date: date
    days: list[DemandHistoryDay]
