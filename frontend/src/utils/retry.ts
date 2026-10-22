import { ApiError } from '../api/client';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Retries an operation that is safe to repeat (a GET, or a POST with an idempotency key or idempotent semantics)
 * when the backend marks the failure as retryable, e.g. LOCK_CONFLICT. Other errors are thrown immediately.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  { attempts = 3, delayMs = 300, wait = sleep }: { attempts?: number; delayMs?: number; wait?: (ms: number) => Promise<void> } = {}
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (e) {
      if (!(e instanceof ApiError) || !e.retryable || attempt >= attempts) {
        throw e;
      }
      await wait(delayMs * attempt);
    }
  }
}
