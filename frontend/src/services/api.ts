import type {
  AccuracyResponse,
  DemandHistoryResponse,
  IntervalsResponse,
  SourceStatus,
  NationalDemandForecastResponse,
} from "../types/api";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) message = body.detail;
    } catch {
      // Keep the status message when the server did not return JSON.
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export function getHealth(signal?: AbortSignal): Promise<SourceStatus> {
  return getJson<SourceStatus>("/api/health", signal);
}

export function getPrimaryWindow(now = new Date()): {
  deliveryDate: string;
  sourceSelection: "earliest" | "latest";
  key: string;
} {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  const today = `${values.year}-${values.month}-${values.day}`
  const afterCutoff = Number(values.hour) > 9 || (Number(values.hour) === 9 && Number(values.minute) >= 20)
  const sourceSelection = afterCutoff ? 'latest' : 'earliest'
  const deliveryDate = afterCutoff
    ? new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + 1)).toISOString().slice(0, 10)
    : today
  return { deliveryDate, sourceSelection, key: `${today}:${sourceSelection}` }
}

export function getPrimaryDemand(
  signal?: AbortSignal,
): Promise<NationalDemandForecastResponse> {
  return getDemandDay(getPrimaryWindow().deliveryDate, signal);
}

export function getDemandDay(
  deliveryDate: string,
  signal?: AbortSignal,
): Promise<NationalDemandForecastResponse> {
  const params = new URLSearchParams({ delivery_date: deliveryDate });
  return getJson<NationalDemandForecastResponse>(`/api/demand/day?${params}`, signal);
}

export function getDemandHistory(
  days = 20,
  signal?: AbortSignal,
): Promise<DemandHistoryResponse> {
  const params = new URLSearchParams({ days: String(days) });
  return getJson<DemandHistoryResponse>(`/api/demand/history?${params}`, signal);
}

export function getIntervals(
  deliveryDate: string,
  cutoffTime: string,
  signal?: AbortSignal,
): Promise<IntervalsResponse> {
  const params = new URLSearchParams({
    delivery_date: deliveryDate,
    cutoff_time: cutoffTime,
  });

  return getJson<IntervalsResponse>(
    `/api/intervals?${params.toString()}`,
    signal,
  );
}

export function getAccuracy(
  deliveryDate: string,
  cutoffTime: string,
  signal?: AbortSignal,
): Promise<AccuracyResponse> {
  const params = new URLSearchParams({
    delivery_date: deliveryDate,
    cutoff_time: cutoffTime,
  });
  return getJson<AccuracyResponse>(
    `/api/accuracy?${params.toString()}`,
    signal,
  );
}
