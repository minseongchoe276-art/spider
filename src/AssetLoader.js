// Bound network waits; parse errors propagate to the character fallback.
export async function fetchAsset(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Asset HTTP ${response.status}: ${url}`);
    return await response.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }
}
