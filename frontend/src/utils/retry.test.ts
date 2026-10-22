import { ApiError } from '../api/client';
import { withRetry } from './retry';

const noWait = jest.fn(() => Promise.resolve());

beforeEach(() => noWait.mockClear());

describe('withRetry', () => {
  it('retries retryable errors with growing delays', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new ApiError(409, 'LOCK_CONFLICT', 'Busy.', [], true))
      .mockRejectedValueOnce(new ApiError(503, 'ERROR', 'Busy.', [], true))
      .mockResolvedValue('ok');

    await expect(withRetry(operation, { wait: noWait })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(noWait.mock.calls).toEqual([[300], [600]]);
  });

  it('gives up after the last attempt', async () => {
    const error = new ApiError(409, 'LOCK_CONFLICT', 'Busy.', [], true);
    const operation = jest.fn().mockRejectedValue(error);

    await expect(withRetry(operation, { attempts: 2, wait: noWait })).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry other errors', async () => {
    const error = new ApiError(409, 'INSUFFICIENT_STOCK', 'No stock.');
    const operation = jest.fn().mockRejectedValue(error);

    await expect(withRetry(operation, { wait: noWait })).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
