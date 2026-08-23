import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface ProductInfo {
  name: string | null;
  price: string | null;
  image: string | null;
  method: "html" | "url-fallback" | "failed";
}

/**
 * Extract the product name from a URL path.
 * "www.amazon.es/Corsair-Vengeance-32GB-Memoria/dp/B0C5JMBNTZ" → "Corsair Vengeance 32GB Memoria"
 */
function nameFromUrl(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return null;

    // Amazon: /Some-Product-Name/dp/ASIN
    const dpIdx = parts.findIndex((p) => p === "dp" || p === "gp" || p === "product");
    if (dpIdx > 0) return parts[dpIdx - 1]?.replace(/-/g, " ").trim() || null;

    // Generic: last meaningful segment (skip query-like segments)
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (!p.match(/^\d+$/) && p.length > 3 && !p.match(/^(dp|gp|product|p|pid|item|ref|cat|categoria|col|tag)$/i)) {
        return p.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Normalize a price string: "349,00" → 349.00
 */
function parsePriceNum(raw: string): number {
  const cleaned = raw.trim();
  if (!cleaned) return NaN;
  if (/\d\.\d{3}/.test(cleaned) && cleaned.includes(","))
    return parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
  if (/\d,\d{3}/.test(cleaned) && cleaned.includes("."))
    return parseFloat(cleaned.replace(/,/g, ""));
  return parseFloat(cleaned.replace(",", "."));
}

/** Collect ALL price-like values from HTML, pick the largest one ≥ €5 */
function bestPriceFromHtml(html: string): string | null {
  const seen = new Set<number>();
  const patterns = [
    /€\s*(\d{1,6}(?:[.,]\d{1,2})?)/g,
    /EUR\s*(\d{1,6}(?:[.,]\d{1,2})?)/gi,
    /(\d{1,6}(?:[.,]\d{1,2})?)\s*€/g,
    /(\d{1,6}(?:[.,]\d{1,2})?)\s*EUR/gi,
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

// -------- HTML extraction helpers --------

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

function extractJsonLdPrice(product: Record<string, unknown>): string | null {
  const rawOffers = product.offers;
  let offersArr: Record<string, unknown>[] = [];
  if (Array.isArray(rawOffers)) offersArr = rawOffers as Record<string, unknown>[];
  else if (rawOffers && typeof rawOffers === "object") offersArr = [rawOffers as Record<string, unknown>];
  if (offersArr.length === 0) return null;
  const offer = offersArr[0];
  if (!offer) return null;
  let priceVal = offer.price;
  let currency = (offer.priceCurrency as string) || "EUR";
  if (priceVal == null && offer.priceSpecification) {
    const spec = offer.priceSpecification as Record<string, unknown>;
    priceVal = spec.price;
    currency = (spec.priceCurrency as string) || currency;
  }
  if (priceVal == null) return null;
  const priceStr = typeof priceVal === "number" ? String(priceVal) : String(priceVal);
  return `${priceStr} ${currency}`;
}

function extractJsonLdImage(product: Record<string, unknown>): string | null {
  const img = product.image;
  if (!img) return null;
  if (typeof img === "string") return img;
  if (Array.isArray(img)) {
    const first = img[0];
    return typeof first === "string" ? first : (first as Record<string, unknown>)?.url as string ?? null;
  }
  if (typeof img === "object") return (img as Record<string, unknown>).url as string ?? null;
  return null;
}

function matchMeta(html: string, property: string): string | null {
  const esc = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${esc}["'][^>]+content=["']([^"']+)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${esc}["']`, "i");
  const m = re1.exec(html) || re2.exec(html);
  if (m) return decodeEntities(m[1]);
  return null;
}

function matchMicrodata(html: string, itemprop: string): string | null {
  const esc = itemprop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<[^>]+itemprop=["']${esc}["'][^>]*>([^<]*)<`, "i");
  const m = re.exec(html);
  if (m) return decodeEntities(m[1].trim());
  const metaRe = new RegExp(`<meta[^>]+itemprop=["']${esc}["'][^>]+content=["']([^"']+)["']`, "i");
  const metaM = metaRe.exec(html);
  if (metaM) return metaM[1];
  const linkRe = new RegExp(`<link[^>]+itemprop=["']${esc}["'][^>]+href=["']([^"']+)["']`, "i");
  const linkM = linkRe.exec(html);
  if (linkM) return linkM[1];
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
  const m = re.exec(html);
  if (m) return decodeEntities(m[1].trim());
  return null;
}

function matchAttr(html: string, attr: string): string | null {
  const esc = attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${esc}=["']([^"']+)["']`, "i");
  const m = re.exec(html);
  return m?.[1] ?? null;
}

function matchIdSrc(html: string, id: string): string | null {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<img[^>]+id=["']${esc}["'][^>]+src=["']([^"']+)["']|<img[^>]+src=["']([^"']+)["'][^>]+id=["']${esc}["']`, "i");
  const m = re.exec(html);
  return m?.[1] ?? m?.[2] ?? null;
}

function matchClassText(html: string, className: string): string | null {
  const escClass = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<[^>]+class=["'][^"']*${escClass}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i");
  let cm: RegExpExecArray | null;
  const globalRe = new RegExp(re.source, "gi");
  while ((cm = globalRe.exec(html)) !== null) {
    const inner = cm[1];
    const numMatch = inner.match(/(\d{1,6}(?:[.,]\d{1,2})?)/);
    if (numMatch) return numMatch[1];
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

function cleanTitle(raw: string | null): string | null {
  if (!raw) return null;
  let t = raw
    .replace(/\s*[-–|]\s*(Amazon|Worten|Fnac|El Corte Inglés|MediaMarkt|PCDIGA|Globaldata|RP|eBay|AliExpress|Shopify|Etsy|Continente|Auchan|Pingo Doce|Lidl|Aldi|Decathlon|IKEA|Leroy Merlin|Zara|Bershka|Pull&Bear|Massimo Dutti|Stradivarius|Oysho).*$/i, "")
    .replace(/\s*[-–|]\s*.*?(?:comprar|buy|acheter|online|store|loja|tienda|magasin).*$/i, "")
    .replace(/\bat\b\s+\S+\.com.*$/i, "")
    .replace(/\|\s*\S+\.\S+.*$/i, "")
    .replace(/\s+/g, " ").trim();
  t = decodeEntities(t);
  if (!t || t.length < 2) return null;
  if (/^\s*(Home|Início|Inicio|Accueil|Shop|Loja|Store|Tienda|Magasin|404|Not Found|Documento no encontrado|Page not found|Página no encontrada)\s*$/i.test(t)) return null;
  return t;
}

/** Main extraction from raw HTML */
function extractFromHtml(html: string): ProductInfo {
  // JSON-LD
  const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = jsonLdRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        const product = findProduct(item);
        if (product?.name) {
          return { name: product.name as string, price: extractJsonLdPrice(product), image: extractJsonLdImage(product), method: "html" };
        }
      }
    } catch { /* continue */ }
  }

  // Open Graph
  const ogTitle = matchMeta(html, "og:title");
  const ogPrice = matchMeta(html, "product:price:amount") || matchMeta(html, "og:price:amount");
  const ogCurrency = matchMeta(html, "product:price:currency") || matchMeta(html, "og:price:currency") || "EUR";
  const ogImage = matchMeta(html, "og:image");
  const twImage = matchMeta(html, "twitter:image");

  // Microdata
  const microName = matchMicrodata(html, "name");
  const microPrice = matchMicrodata(html, "price");
  const microImage = matchMicrodata(html, "image");
  const microImgSrc = matchMicrodataImgSrc(html);

  // Title tag
  const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  const titleTag = cleanTitle(titleMatch?.[1] ?? null);

  // Amazon-specific
  const amazonTitle = matchIdOrClass(html, "productTitle");
  const amazonPrice = matchClassText(html, "a-price-whole")
    || matchIdOrClass(html, "priceblock_ourprice")
    || matchIdOrClass(html, "priceblock_dealprice")
    || matchIdOrClass(html, "priceblock_saleprice")
    || matchAttr(html, "data-asin-price");
  const amazonImage = matchIdSrc(html, "landingImage") || matchIdSrc(html, "imgTagWrapperId");

  // Store-specific
  const wortenPrice = matchClassText(html, "w-product__price")
    || matchClassText(html, "product-price");
  const storePrice = matchClassText(html, "final-price")
    || matchClassText(html, "current-price")
    || matchClassText(html, "product-price-current")
    || matchClassText(html, "f-faixa-preco")
    || matchClassText(html, "price-current");

  // Generic price
  const genericPrice = bestPriceFromHtml(html);

  // Image
  let productImage = ogImage || twImage || microImgSrc || microImage || amazonImage || null;
  if (!productImage) {
    const imgMatch = /<img[^>]+(?:class|id)=["'](?:[^"']*\b)?(?:product|hero|gallery|main)[^"']*["'][^>]+src=["']([^"']+)["']/i.exec(html)
      || /<img[^>]+src=["']([^"']+)["'][^>]+(?:class|id)=["'](?:[^"']*\b)?(?:product|hero|gallery|main)[^"']*["']/i.exec(html);
    productImage = imgMatch?.[1] ?? null;
  }

  const name = ogTitle || microName || amazonTitle || titleTag || null;

  let price: string | null = null;
  if (ogPrice) {
    price = `${ogPrice} ${ogCurrency}`;
  } else {
    const raw = amazonPrice ?? wortenPrice ?? storePrice ?? genericPrice;
    if (raw) {
      const num = parsePriceNum(raw);
      price = isNaN(num) ? raw : `${num} EUR`;
    }
  }

  return { name, price: price?.replace(/\s+/g, " ").trim() ?? null, image: productImage, method: "html" };
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1",
    ];

    let res: Response | null = null;
    let lastErr: unknown = null;

    for (const ua of userAgents) {
      try {
        const r = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
            "Accept-Encoding": "gzip, deflate, br",
            "Cache-Control": "max-age=0",
            "DNT": "1",
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
      // Fetch failed entirely — extract name from URL as fallback
      const guessed = nameFromUrl(url);
      return NextResponse.json({
        ok: true,
        name: guessed,
        price: null,
        image: null,
        method: "url-fallback",
        hint: guessed ? undefined : "Não foi possível aceder ao site. Tenta adicionar manualmente.",
      });
    }

    const html = await res.text();

    // Detect blocked/captcha/too-short pages
    const isBlocked = html.length < 2500 ||
      html.includes("api-services-support@amazon") ||
      html.includes("Enter the characters below") ||
      html.includes("Type the characters") ||
      html.includes("Lo sentimos. La dirección web");

    if (isBlocked) {
      // Try extracting from URL
      const guessed = nameFromUrl(url);
      return NextResponse.json({
        ok: true,
        name: guessed,
        price: null,
        image: null,
        method: "url-fallback",
        hint: guessed ? undefined : "A loja bloqueou o acesso automático. Tenta adicionar manualmente.",
      });
    }

    const info = extractFromHtml(html);

    if (!info.name && !info.price && !info.image) {
      const guessed = nameFromUrl(url);
      return NextResponse.json({
        ok: true,
        name: guessed,
        price: null,
        image: null,
        method: "url-fallback",
        hint: guessed ? undefined : "Não foi possível extrair dados. Tenta adicionar manualmente.",
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