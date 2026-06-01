import { PriceService } from './price.service';

describe('PriceService', () => {
  let service: PriceService;

  beforeEach(() => {
    service = new PriceService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fetches prices from DeFiLlama', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          coins: {
            'bsc:0xBUSD': { price: 1.0, confidence: 0.99 },
          },
        }),
    } as Response);

    const prices = await service.getPrices(['0xBUSD']);

    expect(prices.has('0xBUSD')).toBe(true);
    expect(prices.get('0xBUSD')!.priceUsd).toBe(1.0);
  });

  it('filters out low-confidence prices', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          coins: {
            'bsc:0xBUSD': { price: 1.0, confidence: 0.3 },
          },
        }),
    } as Response);

    const prices = await service.getPrices(['0xBUSD']);
    expect(prices.has('0xBUSD')).toBe(false);
  });

  it('returns empty map when token not found', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ coins: {} }),
    } as Response);

    const prices = await service.getPrices(['0xUnknown']);
    expect(prices.size).toBe(0);
  });

  it('returns empty map on API error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    const prices = await service.getPrices(['0xBUSD']);
    expect(prices.size).toBe(0);
  });

  it('returns empty map on network error', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network'));

    const prices = await service.getPrices(['0xBUSD']);
    expect(prices.size).toBe(0);
  });

  it('returns empty map for empty input', async () => {
    const prices = await service.getPrices([]);
    expect(prices.size).toBe(0);
  });
});
