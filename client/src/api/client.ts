import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AlertCheckSummary,
  AlertResponse,
  AlertsResponse,
  AlertStatusResponse,
  ApiError,
  CreateAlertInput,
  HistoryInterval,
  HistoryRange,
  HistoryResponse,
  Market,
  QuotesResponse,
  StocksResponse,
  UpdateAlertInput,
} from '@shared/types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

export const QUOTES_REFRESH_MS = 60_000;
/** Must match the server's limit in server/src/schemas.ts */
const MAX_SYMBOLS_PER_REQUEST = 50;

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

interface RequestOptions {
  signal?: AbortSignal;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

async function fetchJson<T>(path: string, opts: RequestOptions | AbortSignal = {}): Promise<T> {
  const { signal, method = 'GET', body } = opts instanceof AbortSignal ? { signal: opts } : opts;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      signal,
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiRequestError(
      0,
      'NETWORK_ERROR',
      'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบว่าเซิร์ฟเวอร์ทำงานอยู่',
    );
  }

  if (!res.ok) {
    let code = 'HTTP_ERROR';
    let message = `เซิร์ฟเวอร์ตอบกลับด้วยสถานะ ${res.status}`;
    try {
      const body = (await res.json()) as Partial<ApiError>;
      if (body.error) ({ code, message } = body.error);
    } catch {
      // Non-JSON error body: keep the generic message
    }
    throw new ApiRequestError(res.status, code, message);
  }
  // 204 No Content (e.g. DELETE)
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  stocks: (market?: Market, signal?: AbortSignal) =>
    fetchJson<StocksResponse>(`/api/stocks${market ? `?market=${market}` : ''}`, signal),

  /** Splits long lists into requests of at most MAX_SYMBOLS_PER_REQUEST (the API's limit). */
  quotes: async (symbols: string[], signal?: AbortSignal): Promise<QuotesResponse> => {
    const chunks: string[][] = [];
    for (let i = 0; i < symbols.length; i += MAX_SYMBOLS_PER_REQUEST) {
      chunks.push(symbols.slice(i, i + MAX_SYMBOLS_PER_REQUEST));
    }
    const responses = await Promise.all(
      chunks.map((chunk) =>
        fetchJson<QuotesResponse>(
          `/api/quotes?symbols=${chunk.map(encodeURIComponent).join(',')}`,
          signal,
        ),
      ),
    );
    return { results: responses.flatMap((r) => r.results) };
  },

  history: (symbol: string, range: HistoryRange, interval: HistoryInterval, signal?: AbortSignal) =>
    fetchJson<HistoryResponse>(
      `/api/history/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`,
      signal,
    ),

  alerts: {
    list: (symbol?: string, signal?: AbortSignal) =>
      fetchJson<AlertsResponse>(
        `/api/alerts${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ''}`,
        signal,
      ),
    create: (input: CreateAlertInput) =>
      fetchJson<AlertResponse>('/api/alerts', { method: 'POST', body: input }),
    update: (id: number, patch: UpdateAlertInput) =>
      fetchJson<AlertResponse>(`/api/alerts/${id}`, { method: 'PATCH', body: patch }),
    remove: (id: number) => fetchJson<void>(`/api/alerts/${id}`, { method: 'DELETE' }),
    status: (signal?: AbortSignal) => fetchJson<AlertStatusResponse>('/api/alerts/status', signal),
    test: () => fetchJson<{ ok: true }>('/api/alerts/test', { method: 'POST' }),
    check: () => fetchJson<AlertCheckSummary>('/api/alerts/check', { method: 'POST' }),
  },
};

// The list rarely changes, so keep it for the whole session.
export function useStocks() {
  return useQuery({
    queryKey: ['stocks'],
    queryFn: ({ signal }) => api.stocks(undefined, signal),
    select: (data) => data.stocks,
    staleTime: Infinity,
  });
}

export function useQuotes(symbols: string[]) {
  const sorted = [...symbols].sort();
  return useQuery({
    queryKey: ['quotes', sorted],
    queryFn: ({ signal }) => api.quotes(sorted, signal),
    select: (data) => data.results,
    enabled: sorted.length > 0,
    refetchInterval: QUOTES_REFRESH_MS,
    staleTime: QUOTES_REFRESH_MS / 2,
    placeholderData: keepPreviousData,
  });
}

export function useHistory(symbol: string, range: HistoryRange, interval: HistoryInterval) {
  return useQuery({
    queryKey: ['history', symbol, range, interval],
    queryFn: ({ signal }) => api.history(symbol, range, interval, signal),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

/** All alerts, or only those of `symbol`. Refetched every minute so "last sent" stays current. */
export function useAlerts(symbol?: string) {
  return useQuery({
    queryKey: ['alerts', 'list', symbol ?? null],
    queryFn: ({ signal }) => api.alerts.list(symbol, signal),
    select: (data) => data.alerts,
    refetchInterval: 60_000,
  });
}

export function useAlertStatus() {
  return useQuery({
    queryKey: ['alerts', 'status'],
    queryFn: ({ signal }) => api.alerts.status(signal),
    refetchInterval: 60_000,
  });
}

/** Every change to alerts refreshes all alert lists and the status. */
function useAlertMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });
}

export const useCreateAlert = () => useAlertMutation(api.alerts.create);
export const useUpdateAlert = () =>
  useAlertMutation(({ id, patch }: { id: number; patch: UpdateAlertInput }) =>
    api.alerts.update(id, patch),
  );
export const useDeleteAlert = () => useAlertMutation(api.alerts.remove);
export const useCheckAlertsNow = () => useAlertMutation<void, AlertCheckSummary>(api.alerts.check);

export function useTestWebhook() {
  return useMutation({ mutationFn: api.alerts.test });
}
