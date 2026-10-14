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

// Bound parallel requests so animation RTTs overlap without flooding tile downloads.
export async function forEachConcurrent(items, concurrency, visit) {
  let next = 0;
  await Promise.all(Array.from({length: Math.min(concurrency, items.length)}, async () => {
    while (next < items.length) {
      const index = next++;
      await visit(items[index], index);
    }
  }));
}
