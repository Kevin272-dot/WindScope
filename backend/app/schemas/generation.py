from datetime import date, datetime, timezone
from math import isfinite
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class _GenerationSourceRecord(BaseModel):
    model_config = ConfigDict(extra="allow")

    publishTime: datetime
    startTime: datetime
    generation: float | None

    @field_validator("publishTime", "startTime")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Timestamp must include a timezone")
        return value.astimezone(timezone.utc)

    @field_validator("generation", mode="before")
    @classmethod
    def require_finite_number_or_null(cls, value: object) -> object:
        if value is None:
            return value
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("Generation must be a number or null")
        if not isfinite(value):
            raise ValueError("Generation must be finite")
        return value


class FuelHHWindActual(_GenerationSourceRecord):
    dataset: Literal["FUELHH"]
    settlementDate: date
    settlementPeriod: int = Field(strict=True, ge=1, le=48)
    fuelType: Literal["WIND"]


class WindForecast(_GenerationSourceRecord):
    dataset: Literal["WINDFOR"]


class QualityIssue(BaseModel):
    record_index: int
    messages: list[str]


class WindActualQualityReport(BaseModel):
    expected_interval_count: int
    observed_interval_count: int
    missing_intervals: list[datetime]
    valid_record_count: int
    invalid_record_count: int
    null_generation_count: int
    negative_generation_count: int
    duplicate_interval_publication_count: int
    issues: list[QualityIssue]


class WindForecastQualityReport(BaseModel):
    received_record_count: int
    valid_record_count: int
    invalid_record_count: int
    null_generation_count: int
    negative_generation_count: int
    issues: list[QualityIssue]


class HourlyWindActual(BaseModel):
    startTime: datetime
    generation: float | None
    source_interval_count: int


class WindForecastAccuracyReport(BaseModel):
    expected_hour_count: int
    paired_sample_count: int
    missing_forecast_count: int
    missing_actual_count: int
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None
    mape_percent: float | None
    mape_sample_count: int
    mape_zero_actual_excluded_count: int
