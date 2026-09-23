import { HttpAiPredictionClient } from './http-ai-prediction-client';

function makeClient(config: { url?: string; timeoutMs?: number } = {}) {
  const configService = {
    get: jest.fn((key: string) => ({
      'aiService.url': config.url ?? 'https://ai.example.test',
      'aiService.timeoutMs': config.timeoutMs ?? 3000,
    })[key]),
  };
  return new HttpAiPredictionClient(configService as never);
}

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('HttpAiPredictionClient — disabled', () => {
  it('returns null and makes no network call when no AI service URL is configured', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as never;
    const client = makeClient({ url: '' });
    await expect(client.predictReorder([])).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('HttpAiPredictionClient — success path', () => {
  it('returns the validated envelope (modelName/modelVersion/results) for a well-formed 200 response', async () => {
    const body = {
      modelName: 'reorder-net', modelVersion: '1.2.3',
      results: [{ storeId: 'store-1', partId: 'part-1', suggestedQuantity: 12, estimatedWeeksOfCover: '3.50' }],
    };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => body }) as never;
    const client = makeClient();
    const result = await client.predictReorder([]);
    expect(result).toEqual(body);
  });

  it('posts the candidates as the request body to <url>/reorder', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ modelName: 'm', modelVersion: 'v', results: [] }) });
    global.fetch = fetchSpy as never;
    const client = makeClient({ url: 'https://ai.example.test' });
    const candidates = [{ storeId: 's1', partId: 'p1', partSku: 'SKU', onHand: 1, reserved: 0, available: 1, minLevel: 1, maxLevel: 5, openPurchaseOrderQuantity: 0, averageWeeklyConsumption: '0', lookbackWeeks: 8 }];
    await client.predictReorder(candidates);
    expect(fetchSpy.mock.calls[0][0]).toBe('https://ai.example.test/reorder');
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({ candidates });
  });
});

describe('HttpAiPredictionClient — timeout', () => {
  it('aborts and returns null when the AI service does not respond within the configured timeout', async () => {
    global.fetch = jest.fn((_url: string, opts: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
      }),
    ) as never;
    const client = makeClient({ timeoutMs: 20 });
    const result = await client.predictTrainingRisk([]);
    expect(result).toBeNull();
  }, 2000);
});

describe('HttpAiPredictionClient — unreachable / non-2xx', () => {
  it('returns null when the network call rejects (e.g. connection refused/DNS failure)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND ai.example.test')) as never;
    const client = makeClient();
    await expect(client.predictReorder([])).resolves.toBeNull();
  });

  it('returns null on a non-2xx HTTP status without throwing', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }) as never;
    const client = makeClient();
    await expect(client.predictReorder([])).resolves.toBeNull();
  });
});

describe('HttpAiPredictionClient — invalid/malformed response', () => {
  it('returns null when the response body is not valid JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError('Unexpected token'); } }) as never;
    const client = makeClient();
    await expect(client.predictReorder([])).resolves.toBeNull();
  });

  it('returns null when the top-level envelope is missing required fields', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) }) as never; // no modelName/modelVersion
    const client = makeClient();
    await expect(client.predictReorder([])).resolves.toBeNull();
  });

  it('returns null when results is not an array', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ modelName: 'm', modelVersion: 'v', results: 'not-an-array' }) }) as never;
    const client = makeClient();
    await expect(client.predictReorder([])).resolves.toBeNull();
  });

  it('filters out individual malformed results while keeping the valid ones (reorder)', async () => {
    const body = {
      modelName: 'm', modelVersion: 'v',
      results: [
        { storeId: 's1', partId: 'p1', suggestedQuantity: 5 }, // valid
        { storeId: 's2', partId: 'p2', suggestedQuantity: -1 }, // invalid: negative
        { storeId: 's3', suggestedQuantity: 3 }, // invalid: missing partId
      ],
    };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => body }) as never;
    const client = makeClient();
    const result = await client.predictReorder([]);
    expect(result!.results).toEqual([{ storeId: 's1', partId: 'p1', suggestedQuantity: 5 }]);
  });

  it('rejects a risk result with an invalid riskLevel enum value', async () => {
    const body = { modelName: 'm', modelVersion: 'v', results: [{ studentId: 's1', courseId: 'c1', riskLevel: 'EXTREME', flags: [] }] };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => body }) as never;
    const client = makeClient();
    const result = await client.predictTrainingRisk([]);
    expect(result!.results).toEqual([]);
  });

  it('rejects a risk result containing an unknown flag value', async () => {
    const body = { modelName: 'm', modelVersion: 'v', results: [{ studentId: 's1', courseId: 'c1', riskLevel: 'LOW', flags: ['NOT_A_REAL_FLAG'] }] };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => body }) as never;
    const client = makeClient();
    const result = await client.predictTrainingRisk([]);
    expect(result!.results).toEqual([]);
  });
});
