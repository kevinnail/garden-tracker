import {
  ApiClientError,
  fetchBackendHealth,
  mapStatusToErrorKind,
} from '@/src/services/apiClient';

function makeJsonResponse(body: unknown, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (key: string) => {
        if (key.toLowerCase() === 'content-type') return 'application/json';
        return null;
      },
    } as Headers,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('mapStatusToErrorKind', () => {
  it('maps auth and conflict statuses', () => {
    expect(mapStatusToErrorKind(401)).toBe('unauthorized');
    expect(mapStatusToErrorKind(403)).toBe('forbidden');
    expect(mapStatusToErrorKind(409)).toBe('conflict');
  });

  it('maps 5xx statuses to server', () => {
    expect(mapStatusToErrorKind(500)).toBe('server');
    expect(mapStatusToErrorKind(503)).toBe('server');
  });

  it('maps other statuses to generic http', () => {
    expect(mapStatusToErrorKind(400)).toBe('http');
    expect(mapStatusToErrorKind(404)).toBe('http');
  });
});

describe('fetchBackendHealth', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('returns parsed health JSON and sends credentials', async () => {
    const fetchMock = jest.fn().mockResolvedValue(makeJsonResponse({ status: 'ok', timestamp: '2026-05-11T12:00:00.000Z' }, 200));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const result = await fetchBackendHealth();
    expect(result.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(requestInit.credentials).toBe('include');
  });

  it('maps a 403 response to a typed forbidden error', async () => {
    const fetchMock = jest.fn().mockResolvedValue(makeJsonResponse({ error: 'Subscription required' }, 403));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    await expect(fetchBackendHealth()).rejects.toMatchObject<Partial<ApiClientError>>({
      name: 'ApiClientError',
      kind: 'forbidden',
      status: 403,
    });
  });

  it('maps network failures to typed network errors', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('Network down'));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    await expect(fetchBackendHealth()).rejects.toMatchObject<Partial<ApiClientError>>({
      name: 'ApiClientError',
      kind: 'network',
    });
  });
});
