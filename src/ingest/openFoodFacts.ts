const SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";
const USER_AGENT = "Bontrend/0.1 (local prototype)";
// The search endpoint answers bursts with 503. Gaps of 12 s passed in a manual test, 7 s did not always.
const DELAY_MS = 12_000;
// A 503 is retried after a wait, a few times at most. Any other failure stops the run.
const RETRY_WAIT_MS = 20_000;
const MAX_RETRIES = 5;

let lastRequestAt = 0;

export type OffMatch = {
  productName: string | null;
  nutriScore: string | null;
  nutrients: unknown;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function searchOpenFoodFacts(itemName: string): Promise<OffMatch | null> {
  const params = new URLSearchParams({
    search_terms: itemName,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "1",
    fields: "product_name,nutriscore_grade,nutriments",
  });
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    const wait = lastRequestAt + (attempt === 0 ? DELAY_MS : RETRY_WAIT_MS) - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    res = await fetch(`${SEARCH_URL}?${params}`, { headers: { "User-Agent": USER_AGENT } });
    if (res.status !== 503 || attempt === MAX_RETRIES) break;
    console.log(`  OFF 503 for "${itemName}", retry ${attempt + 1} of ${MAX_RETRIES}`);
  }
  if (!res.ok) throw new Error(`Open Food Facts request for "${itemName}" failed: ${res.status} ${res.statusText}`);

  const body = (await res.json()) as {
    products?: { product_name?: string; nutriscore_grade?: string; nutriments?: unknown }[];
  };
  const product = body.products?.[0];
  if (!product) return null;
  return {
    productName: product.product_name || null,
    nutriScore: product.nutriscore_grade || null,
    nutrients: product.nutriments ?? null,
  };
}
