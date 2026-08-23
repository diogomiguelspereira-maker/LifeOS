import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface ProductInfo {
  name: string | null;
  price: string | null;
  image: string | null;
}

/**
 * Extract product metadata from HTML using every trick available:
 * JSON-LD, Open Graph, Twitter Cards, microdata, schema.org, meta tags,
 * and site-specific fallback patterns for Amazon, Worten, Fnac, etc.
 */
function extract(html: string): ProductInfo {
  // 1 ── JSON-LD structured data (richest source on modern sites)
  const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = jsonLdRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        const product = findProduct(item);
        if (product && product.name) {
          const price = extractJsonLdPrice(product);
          const img = extractJsonLdImage(product);
          return { name: product.name as string, price, image: img };
        }
      }
    } catch { /* continue */ }
  }

  // 2 ── Open Graph (works on almost every site)
  const ogTitle = matchMeta(html, "og:title");
  const ogPrice = matchMeta(html, "product:price:amount") || matchMeta(html, "og:price:amount");
  const ogCurrency = matchMeta(html, "product:price:currency") || matchMeta(html, "og:price:currency") || "EUR";
  const ogImage = matchMeta(html, "og:image");

  // 3 ── Twitter Cards
  const twImage = matchMeta(html, "twitter:image");

  // 4 ── Schema microdata (itemprop)
  const microName = matchMicrodata(html, "name");
  const microPrice = matchMicrodata(html, "price");
  const microImage = matchMicrodata(html, "image");
  const microImgSrc = matchMicrodataImgSrc(html);

  // 5 ── HTML title
  const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  const titleTag = cleanTitle(titleMatch?.[1] ?? null);

  // 6 ── Amazon-specific: span#productTitle, #priceblock_ourprice etc
  const amazonTitle = matchIdOrClass(html, "productTitle");
  const amazonPriceWhole = matchIdOrClass(html, "priceblock_ourprice")
    || matchIdOrClass(html, "priceblock_dealprice")
    || matchAttr(html, "data-asin-price");
  const amazonImage = matchIdSrc(html, "landingImage") || matchIdSrc(html, "imgTagWrapperId");

  // 7 ── Worten-specific
  const wortenPrice = matchClassText(html, "w-product__price", "current")
    || matchClassText(html, "product-price", "value");

  // 8 ── Generic price regex patterns
  const pricePatterns = [
    /(?:€|EUR)\s*(\d{1,6}(?:[.,]\d{1,2})?)/,
    /(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:€|EUR)/,
    /price["\s:=]+(\d{1,6}(?:[.,]\d{1,2})?)/i,
    /"price"\s*:\s*["']?(\d{1,6}(?:[.,]\d{1,2})?)/i,
  ];
  let genericPrice: string | null = null;
  for (const pat of pricePatterns) {
    const pm = html.match(pat);
    if (pm) { genericPrice = pm[1]; break; }
  }

  // 9 ── Image: try img with product/hero in alt/class/id
  let productImage = ogImage || twImage || microImgSrc || microImage || amazonImage || null;
  if (!productImage) {
    const imgMatch = /<img[^>]+(?:class|id)=["'](?:[^"']*\b)?(?:product|hero|gallery|main)[^"']*["'][^>]+src=["']([^"']+)["']/i.exec(html)
      || /<img[^>]+src=["']([^"']+)["'][^>]+(?:class|id)=["'](?:[^"']*\b)?(?:product|hero|gallery|main)[^"']*["']/i.exec(html);
    productImage = imgMatch?.[1] ?? null;
  }

  // Assemble result
  const name = ogTitle || microName || amazonTitle || titleTag || null;
  const price = ogPrice
    ? `${ogPrice} ${ogCurrency}`
    : (amazonPriceWhole ? `${amazonPriceWhole} EUR` : (wortenPrice ?? genericPrice ?? null));
  const image = productImage || null;

  return { name, price: price ? price.replace(/\s+/g, " ").trim() : null, image };
}

/** Dig into a JSON-LD blob to find a Product node. */
function findProduct(obj: unknown): Record<string, unknown> | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (o["@type"] === "Product") return o;
  // @graph array
  if (Array.isArray(o["@graph"])) {
    for (const g of o["@graph"]) {
      const p = findProduct(g);
      if (p) return p;
    }
  }
  // Nested mainEntity
  if (o.mainEntity) return findProduct(o.mainEntity);
  return null;
}

function extractJsonLdPrice(product: Record<string, unknown>): string | null {
  const offers = (product.offers as Record<string, unknown>[]) ?? [product.offers as Record<string, unknown>].filter(Boolean);
  const offer = (Array.isArray(offers) ? offers[0] : offers) as Record<string, unknown> | undefined;
  if (!offer?.price) return null;
  const currency = (offer.priceCurrency as string) || "EUR";
  return `${offer.price} ${currency}`;
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
  // property="..." content="..."
  const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${esc}["'][^>]+content=["']([^"']+)["']`, "i");
  // content="..." property="..."
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${esc}["']`, "i");
  const m = re1.exec(html) || re2.exec(html);
  if (m) return decodeEntities(m[1]);
  return null;
}

function matchMicrodata(html: string, itemprop: string): string | null {
  const esc = itemprop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // <span itemprop="name">Text</span>
  const re = new RegExp(`<[^>]+itemprop=["']${esc}["'][^>]*>([^<]*)<`, "i");
  const m = re.exec(html);
  if (m) return decodeEntities(m[1].trim());

  // <meta itemprop="price" content="29.99">
  const metaRe = new RegExp(`<meta[^>]+itemprop=["']${esc}["'][^>]+content=["']([^"']+)["']`, "i");
  const metaM = metaRe.exec(html);
  if (metaM) return metaM[1];

  // <link itemprop="image" href="...">
  const linkRe = new RegExp(`<link[^>]+itemprop=["']${esc}["'][^>]+href=["']([^"']+)["']`, "i");
  const linkM = linkRe.exec(html);
  if (linkM) return linkM[1];

  return null;
}

function matchMicrodataImgSrc(html: string): string | null {
  // <img itemprop="image" src="...">
  const m = /<img[^>]+itemprop=["']image["'][^>]+src=["']([^"']+)["']/i.exec(html)
    || /<img[^>]+src=["']([^"']+)["'][^>]+itemprop=["']image["']/i.exec(html);
  return m?.[1] ?? null;
}

function matchIdOrClass(html: string, id: string): string | null {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // <... id="productTitle">text</...>
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

function matchClassText(html: string, className: string, contained: string): string | null {
  const escClass = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escContained = contained.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<[^>]+class=["'][^"']*${escClass}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i");
  let cm: RegExpExecArray | null;
  const globalRe = new RegExp(re.source, "gi");
  while ((cm = globalRe.exec(html)) !== null) {
    const inner = cm[1];
    const priceRe = new RegExp(`(?:€|EUR|${escContained})[\\s:]*?(\\d{1,6}(?:[.,]\\d{1,2})?)`, "i");
    const pm = priceRe.exec(inner);
    if (pm) return pm[1];
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

function cleanTitle(raw: string | null): string | null {
  if (!raw) return null;
  let t = raw
    .replace(/\s*[-–|]\s*(Amazon|Worten|Fnac|El Corte Inglés|MediaMarkt|PCDIGA|Globaldata|RP|eBay|AliExpress|Shopify|Etsy|Continente|Auchan|Pingo Doce|Lidl|Aldi|Decathlon|IKEA|Leroy Merlin|Zara|Bershka|Pull&Bear|Massimo Dutti|Stradivarius|Oysho).*$/i, "")
    .replace(/\s*[-–|]\s*.*?(?:comprar|buy|acheter|comprar|online|store|loja|tienda|magasin).*$/i, "")
    .replace(/\bat\b\s+\S+\.com.*$/i, "")
    .replace(/\|\s*\S+\.\S+.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  t = decodeEntities(t);
  if (!t || t.length < 2) return null;
  if (/^\s*(Home|Início|Inicio|Accueil|Shop|Loja|Store|Tienda|Magasin|404|Not Found)\s*$/i.test(t)) return null;
  return t;
}

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
    const timeout = setTimeout(() => controller.abort(), 10000);

    // Multiple User-Agents to try — some stores block bot-looking ones
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
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
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
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
        return NextResponse.json({ error: "timeout", hint: "O site demorou muito. Tenta adicionar manualmente." }, { status: 504 });
      }
      return NextResponse.json({ error: "fetch-failed" }, { status: 502 });
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return NextResponse.json({ error: "not-html" }, { status: 415 });
    }

    const html = await res.text();
    const info = extract(html);

    // If we got basically nothing, report it
    if (!info.name && !info.price && !info.image) {
      return NextResponse.json({
        ok: true,
        name: null,
        price: null,
        image: null,
        hint: "Não foi possível extrair dados automaticamente. Tenta adicionar manualmente.",
      });
    }

    return NextResponse.json({ ok: true, name: info.name, price: info.price, image: info.image });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ error: "timeout" }, { status: 504 });
    }
    return NextResponse.json({ error: "scrape-failed" }, { status: 500 });
  }
}