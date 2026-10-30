import type { AccuracyResponse, SourceStatus } from '../types/api'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { signal })
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = (await response.json()) as { detail?: string }
      if (body.detail) message = body.detail
    } catch {
      // Keep the status message when the server did not return JSON.
    }
    throw new Error(message)
  }
  return (await response.json()) as T
}

export function getHealth(signal?: AbortSignal): Promise<SourceStatus> {
  return getJson<SourceStatus>('/api/health', signal)
}

export function getAccuracy(
  deliveryDate: string,
  cutoffTime: string,
  signal?: AbortSignal,
): Promise<AccuracyResponse> {
  const params = new URLSearchParams({
    delivery_date: deliveryDate,
    cutoff_time: cutoffTime,
  })
  return getJson<AccuracyResponse>(`/api/accuracy?${params.toString()}`, signal)
}
