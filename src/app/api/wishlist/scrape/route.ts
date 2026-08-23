import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface ProductInfo {
  name: string | null;
  price: string | null;
  image: string | null;
  method: "scrapingbee" | "direct" | "url-fallback" | "failed";
}

// -------- ScrapingBee generic fetch --------

async function fetchViaScrapingBee(url: string): Promise<string | null> {
  const key = process.env.SCRAPINGBEE_API_KEY;
  if (!key) return null;

  try {
    const sbUrl = `https://app.scrapingbee.com/api/v1/?api_key=${encodeURIComponent(key)}&url=${encodeURIComponent(url)}&render_js=false&stealth_proxy=true&country_code=pt`;

    const res = await fetch(sbUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;

    const html = await res.text();
    if (html.length < 500) return null; // too short = blocked/error
    return html;
  } catch {
    return null;
  }
}

// -------- URL fallback: extract name from path --------

function nameFromUrl(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return null;
    const dpIdx = parts.findIndex((p) => p === "dp" || p === "gp" || p === "product");
    if (dpIdx > 0) return parts[dpIdx - 1]?.replace(/-/g, " ").trim() || null;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (!p.match(/^\d+$/) && p.length > 3 && !p.match(/^(dp|gp|product|p|pid|item|ref|cat|categoria|col|tag)$/i)) {
        return p.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
      }
    }
    return null;
  } catch { return null; }
}

// -------- Price parsing --------

function parsePriceNum(raw: string): number {
  const cleaned = raw.trim();
  if (!cleaned) return NaN;
  if (/\d\.\d{3}/.test(cleaned) && cleaned.includes(","))
    return parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
  if (/\d,\d{3}/.test(cleaned) && cleaned.includes("."))
    return parseFloat(cleaned.replace(/,/g, ""));
  return parseFloat(cleaned.replace(",", "."));
}

function bestPriceFromHtml(html: string): string | null {
  const seen = new Set<number>();
  const patterns = [
    /€\s*(\d{1,6}(?:[.,]\d{1,2})?)/g, /EUR\s*(\d{1,6}(?:[.,]\d{1,2})?)/gi,
    /(\d{1,6}(?:[.,]\d{1,2})?)\s*€/g, /(\d{1,6}(?:[.,]\d{1,2})?)\s*EUR/gi,
    /\$\s*(\d{1,6}(?:[.,]\d{1,2})?)/g, /(\d{1,6}(?:[.,]\d{1,2})?)\s*\$/g,
    /"price"\s*:\s*"?(\d{1,6}(?:[.,]\d{1,2})?)/gi,
    /'price'\s*:\s*'?(\d{1,6}(?:[.,]\d{1,2})?)/gi,
    /price["']?\s*[:=]\s*["']?(\d{1,6}(?:[.,]\d{2})?)/gi,
    /data-price[=:]\s*["']?(\d{1,6}(?:[.,]\d{2})?)/gi,
  ];
  for (const pat of patterns) {
    let pm: RegExpExecArray | null;
    pat.lastIndex = 0;
    while ((pm = pat.exec(html)) !== null) {
      const n = parsePriceNum(pm[1]);
      if (!isNaN(n) && n > 0) seen.add(n);
    }
  }
  if (seen.size === 0) return null;
  const sorted = [...seen].sort((a, b) => b - a);
  const best = sorted.find((n) => n >= 5) ?? sorted[0];
  return best % 1 === 0 ? String(best) : best.toFixed(2);
}

// Detect currency from page (€ first since most of our users are in EU)
function detectCurrency(html: string, hostname: string): string {
  // Domain-based currency hint
  if (hostname.includes(".es") || hostname.includes(".de") || hostname.includes(".fr") || hostname.includes(".it") || hostname.includes(".nl") || hostname.includes(".be") || hostname.includes(".pt")) return "EUR";
  if (hostname.includes(".co.uk")) return "GBP";
  if (hostname.includes(".co.jp")) return "JPY";
  // Content-based detection
  if (/€\d|EUR/i.test(html) || /\d[.,]\d{2}\s*€/i.test(html)) return "EUR";
  if (/\$\d|USD/.test(html)) return "USD";
  if (/£\d|GBP/.test(html)) return "GBP";
  return "EUR";
}

// -------- HTML extraction --------

function findProduct(obj: unknown): Record<string, unknown> | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (o["@type"] === "Product") return o;
  if (Array.isArray(o["@graph"])) {
    for (const g of o["@graph"]) { const p = findProduct(g); if (p) return p; }
  }
  if (o.mainEntity) return findProduct(o.mainEntity);
  return null;
}

function extractJsonLdPrice(prod: Record<string, unknown>): string | null {
  const raw = prod.offers;
  let arr: Record<string, unknown>[] = [];
  if (Array.isArray(raw)) arr = raw as Record<string, unknown>[];
  else if (raw && typeof raw === "object") arr = [raw as Record<string, unknown>];
  if (arr.length === 0) return null;
  const o = arr[0];
  if (!o) return null;
  let pv = o.price; const cur = (o.priceCurrency as string) || "EUR";
  if (pv == null && o.priceSpecification) {
    const s = o.priceSpecification as Record<string, unknown>;
    pv = s.price;
  }
  if (pv == null) return null;
  return `${typeof pv === "number" ? pv : pv} ${cur}`;
}

function extractJsonLdImage(prod: Record<string, unknown>): string | null {
  const img = prod.image; if (!img) return null;
  if (typeof img === "string") return img;
  if (Array.isArray(img)) {
    const f = img[0];
    return typeof f === "string" ? f : (f as Record<string, unknown>)?.url as string ?? null;
  }
  if (typeof img === "object") return (img as Record<string, unknown>).url as string ?? null;
  return null;
}

function matchMeta(html: string, property: string): string | null {
  const esc = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${esc}["'][^>]+content=["']([^"']+)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${esc}["']`, "i");
  const m = re1.exec(html) || re2.exec(html);
  return m ? decodeEntities(m[1]) : null;
}

function matchMicrodata(html: string, itemprop: string): string | null {
  const esc = itemprop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<[^>]+itemprop=["']${esc}["'][^>]*>([^<]*)<`, "i");
  const m = re.exec(html); if (m) return decodeEntities(m[1].trim());
  const mr = new RegExp(`<meta[^>]+itemprop=["']${esc}["'][^>]+content=["']([^"']+)["']`, "i");
  const mm = mr.exec(html); if (mm) return mm[1];
  const lr = new RegExp(`<link[^>]+itemprop=["']${esc}["'][^>]+href=["']([^"']+)["']`, "i");
  const lm = lr.exec(html); if (lm) return lm[1];
  return null;
}

function matchMicrodataImgSrc(html: string): string | null {
  const m = /<img[^>]+itemprop=["']image["'][^>]+src=["']([^"']+)["']/i.exec(html)
    || /<img[^>]+src=["']([^"']+)["'][^>]+itemprop=["']image["']/i.exec(html);
  return m?.[1] ?? null;
}

function matchIdOrClass(html: string, id: string): string | null {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<[^>]+id=["']${esc}["'][^>]*>\\s*([^<]+)`, "i");
  const m = re.exec(html); return m ? decodeEntities(m[1].trim()) : null;
}

function matchAttr(html: string, attr: string): string | null {
  const esc = attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${esc}=["']([^"']+)["']`, "i");
  return re.exec(html)?.[1] ?? null;
}

function matchIdSrc(html: string, id: string): string | null {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<img[^>]+id=["']${esc}["'][^>]+src=["']([^"']+)["']|<img[^>]+src=["']([^"']+)["'][^>]+id=["']${esc}["']`, "i");
  const m = re.exec(html); return m?.[1] ?? m?.[2] ?? null;
}

function matchClassText(html: string, className: string): string | null {
  const esc = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<[^>]+class=["'][^"']*${esc}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i");
  let cm: RegExpExecArray | null;
  const gr = new RegExp(re.source, "gi");
  while ((cm = gr.exec(html)) !== null) {
    const nm = cm[1].match(/(\d{1,6}(?:[.,]\d{1,2})?)/);
    if (nm) return nm[1];
  }
  return null;
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

function cleanTitle(raw: string | null): string | null {
  if (!raw) return null;
  let t = raw.replace(/\s*[-–|]\s*(Amazon|Worten|Fnac|El Corte Inglés|MediaMarkt|PCDIGA|Globaldata|RP|eBay|AliExpress|Shopify|Etsy|Continente|Auchan|Pingo Doce|Lidl|Aldi|Decathlon|IKEA|Leroy Merlin|Zara|Bershka|Pull&Bear|Massimo Dutti|Stradivarius|Oysho).*$/i, "")
    .replace(/\s*[-–|]\s*.*?(?:comprar|buy|acheter|online|store|loja|tienda|magasin).*$/i, "")
    .replace(/\bat\b\s+\S+\.com.*$/i, "").replace(/\|\s*\S+\.\S+.*$/i, "")
    .replace(/\s+/g, " ").trim();
  t = decodeEntities(t);
  if (!t || t.length < 2) return null;
  if (/^\s*(Home|Início|Inicio|Accueil|Shop|Loja|Store|Tienda|Magasin|404|Not Found|Documento no encontrado|Page not found|Página no encontrada)\s*$/i.test(t)) return null;
  return t;
}

/** Extract Amazon price from a-price-whole + a-price-fraction, or a-offscreen */
function amazonCombinedPrice(html: string): string | null {
  // Try the aria-hidden span that has the full price text: "448,99€"
  const offscreenMatch = /<span[^>]+class="[^"]*a-offscreen[^"]*"[^>]*>\s*([^<]+?)\s*<\/span>/i.exec(html);
  if (offscreenMatch) {
    const text = offscreenMatch[1].trim();
    // "448,99€" or "448,99 €" → extract number
    const m = text.match(/([\d.,]+)/);
    if (m) {
      const num = parsePriceNum(m[0]);
      if (!isNaN(num) && num >= 1) return num % 1 === 0 ? String(num) : num.toFixed(2);
    }
  }
  // Try combining whole + fraction
  const whole = matchClassText(html, "a-price-whole");
  if (!whole) return null;
  const fraction = matchClassText(html, "a-price-fraction");
  return fraction ? parseFloat(`${whole}.${fraction}`).toString() : whole;
}

function extractFromHtml(html: string, hostname?: string): ProductInfo {
  // JSON-LD
  const jlr = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = jlr.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        const prod = findProduct(item);
        if (prod?.name) {
          return { name: prod.name as string, price: extractJsonLdPrice(prod), image: extractJsonLdImage(prod), method: "direct" };
        }
      }
    } catch { /* continue */ }
  }

  const ogTitle = matchMeta(html, "og:title");
  const ogPrice = matchMeta(html, "product:price:amount") || matchMeta(html, "og:price:amount");
  const ogCurrency = matchMeta(html, "product:price:currency") || matchMeta(html, "og:price:currency") || "EUR";
  const ogImage = matchMeta(html, "og:image");
  const twImage = matchMeta(html, "twitter:image");
  const microName = matchMicrodata(html, "name");
  const microPrice = matchMicrodata(html, "price");
  const microImage = matchMicrodata(html, "image");
  const microImgSrc = matchMicrodataImgSrc(html);
  const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  const titleTag = cleanTitle(titleMatch?.[1] ?? null);

  const amazonTitle = matchIdOrClass(html, "productTitle");
  const amazonPrice = amazonCombinedPrice(html)
    || matchIdOrClass(html, "priceblock_ourprice")
    || matchIdOrClass(html, "priceblock_dealprice")
    || matchIdOrClass(html, "priceblock_saleprice")
    || matchAttr(html, "data-asin-price");
  const amazonImage = matchIdSrc(html, "landingImage") || matchIdSrc(html, "imgTagWrapperId");

  const wortenPrice = matchClassText(html, "w-product__price") || matchClassText(html, "product-price");
  const storePrice = matchClassText(html, "final-price")
    || matchClassText(html, "current-price")
    || matchClassText(html, "product-price-current")
    || matchClassText(html, "f-faixa-preco")
    || matchClassText(html, "price-current");

  const genericPrice = bestPriceFromHtml(html);
  const currency = detectCurrency(html, hostname || "");

  let productImage = ogImage || twImage || microImgSrc || microImage || amazonImage || null;
  if (!productImage) {
    const im = /<img[^>]+(?:class|id)=["'](?:[^"']*\b)?(?:product|hero|gallery|main)[^"']*["'][^>]+src=["']([^"']+)["']/i.exec(html)
      || /<img[^>]+src=["']([^"']+)["'][^>]+(?:class|id)=["'](?:[^"']*\b)?(?:product|hero|gallery|main)[^"']*["']/i.exec(html);
    productImage = im?.[1] ?? null;
  }

  const name = ogTitle || microName || amazonTitle || titleTag || null;

  let price: string | null = null;
  if (ogPrice) {
    price = `${ogPrice} ${ogCurrency}`;
  } else {
    const raw = amazonPrice ?? wortenPrice ?? storePrice ?? genericPrice;
    if (raw) {
      const num = parsePriceNum(raw);
      price = isNaN(num) ? raw : `${num} ${currency}`;
    }
  }

  return { name, price: price?.replace(/\s+/g, " ").trim() ?? null, image: productImage, method: "direct" };
}

// ================================================================
// POST handler
// ================================================================
export async function POST(request: Request) {
  try {
    const { url } = (await request.json().catch(() => ({}))) as { url?: string };
    if (!url) return NextResponse.json({ error: "missing-url" }, { status: 400 });

    let parsed: URL;
    try { parsed = new URL(url); } catch {
      return NextResponse.json({ error: "invalid-url" }, { status: 400 });
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json({ error: "invalid-protocol" }, { status: 400 });
    }

    // ----- Try ScrapingBee first (handles Amazon, anti-bot for all sites) -----
    let html = await fetchViaScrapingBee(url);
    let method: ProductInfo["method"] = "scrapingbee";

    // ----- Fallback: direct fetch -----
    if (!html) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      let res: Response | null = null;
      let lastErr: unknown = null;

      for (const ua of [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15",
      ]) {
        try {
          const r = await fetch(url, {
            signal: controller.signal,
            headers: {
              "User-Agent": ua,
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
              "Accept-Encoding": "gzip, deflate, br",
              "Cache-Control": "max-age=0",
              "Upgrade-Insecure-Requests": "1",
            },
            redirect: "follow",
          });
          if (r.ok) { res = r; break; }
        } catch (e) { lastErr = e; }
      }
      clearTimeout(timeout);

      if (!res) {
        if (lastErr instanceof Error && lastErr.name === "AbortError") {
          return NextResponse.json({ error: "timeout" }, { status: 504 });
        }
        const guessed = nameFromUrl(url);
        return NextResponse.json({
          ok: true, name: guessed, price: null, image: null, method: "url-fallback",
          hint: guessed ? undefined : "Não foi possível aceder ao site.",
        });
      }

      html = await res.text();
      method = "direct";
    }

    // ----- Parse the HTML -----
    const isBlocked = html.length < 2500 ||
      html.includes("api-services-support@amazon") ||
      html.includes("Enter the characters below") ||
      html.includes("Type the characters");

    if (isBlocked) {
      const guessed = nameFromUrl(url);
      return NextResponse.json({
        ok: true, name: guessed, price: null, image: null, method: "url-fallback",
        hint: guessed ? undefined : "O site bloqueou o acesso.",
      });
    }

    const info = extractFromHtml(html, parsed.hostname);
    info.method = method;

    if (!info.name && !info.price && !info.image) {
      const guessed = nameFromUrl(url);
      return NextResponse.json({
        ok: true, name: guessed, price: null, image: null, method: "url-fallback",
        hint: guessed ? undefined : "Não foi possível extrair dados.",
      });
    }

    return NextResponse.json({ ok: true, ...info });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ error: "timeout" }, { status: 504 });
    }
    return NextResponse.json({ error: "scrape-failed" }, { status: 500 });
  }
}