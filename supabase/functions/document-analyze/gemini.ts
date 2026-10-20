// At most two attempts. The caller authenticates and reserves one analysis first.
// A provider error never publishes a template or calendar event.
export interface GeminiOptions {
  apiKey: string;
  model: string;
  fallbackModel?: string;
  payload: string;
  signal?: AbortSignal;
  attemptTimeoutMs?: number;
}
export async function callGemini(
  options: GeminiOptions,
  fetcher: typeof fetch = fetch,
): Promise<{ response: Response; modelUsed: string }> {
  const attempts = [options.model, options.fallbackModel || options.model];
  if (attempts.some((model) => !/^[a-zA-Z0-9.-]{1,100}$/.test(model)))
    throw new Error("Invalid Gemini model configuration");
  for (let i = 0; i < attempts.length; i++) {
    const modelUsed = attempts[i];
    const timeout = AbortSignal.timeout(options.attemptTimeoutMs ?? 45000);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout;
    try {
      const response = await fetcher(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelUsed}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": options.apiKey,
          },
          body: options.payload,
          signal,
        },
      );
      if (
        i === 0 &&
        [503, 504].includes(response.status) &&
        !options.signal?.aborted
      ) {
        await response.body?.cancel();
        continue;
      }
      return { response, modelUsed };
    } catch (error) {
      if (
        i === 0 &&
        !options.signal?.aborted &&
        error instanceof Error &&
        ["TimeoutError", "AbortError", "TypeError"].includes(error.name)
      )
        continue;
      throw error;
    }
  }
  throw new Error("Gemini unavailable");
}
