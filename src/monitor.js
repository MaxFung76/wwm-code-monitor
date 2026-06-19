const SOURCE_URL =
  "https://forum.gamer.com.tw/C.php?bsn=75703&snA=388";
const SOURCE_HOST = "forum.gamer.com.tw";
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

const CODE_KEYWORDS = [
  "兌換碼",
  "禮包碼",
  "序號",
  "redeem",
  "redemption code",
  "gift code",
  "promo code",
];

const BLOCKED_TOKENS = new Set([
  "DISCORD",
  "FACEBOOK",
  "INSTAGRAM",
  "OFFICIAL",
  "REDEMPTION",
  "TWITTER",
  "YOUTUBE",
]);

export function normalizeCode(value) {
  return value.trim().toUpperCase();
}

function decodeHtmlEntities(text) {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return text.replace(
    /&(#x[\da-f]+|#\d+|[a-z]+);/gi,
    (entity, value) => {
      if (value.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(value.slice(2), 16));
      }
      if (value.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(value.slice(1), 10));
      }
      return named[value.toLowerCase()] ?? entity;
    },
  );
}

function htmlToText(html) {
  return decodeHtmlEntities(
    html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|\/div|\/p|\/li|\/h[1-6])\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function looksLikeCode(value) {
  const code = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{5,31}$/.test(code)) return false;

  const normalized = normalizeCode(code);
  if (BLOCKED_TOKENS.has(normalized)) return false;
  if (/\.(COM|NET|ORG|GG|IO)$/i.test(normalized)) return false;

  const hasLetter = /[A-Za-z]/.test(code);
  const hasDigit = /\d/.test(code);
  const isUppercaseLettersOnly = /^[A-Z]{8,24}$/.test(code);
  return hasLetter && (hasDigit || isUppercaseLettersOnly);
}

function extractCodes(text, requireKeyword) {
  if (!text) return [];
  if (
    requireKeyword &&
    !CODE_KEYWORDS.some((keyword) =>
      text.toLowerCase().includes(keyword.toLowerCase()),
    )
  ) {
    return [];
  }

  const tokens = text.match(/[A-Za-z0-9][A-Za-z0-9_-]{5,31}/g) ?? [];
  const codes = new Map();
  for (const token of tokens) {
    if (looksLikeCode(token)) codes.set(normalizeCode(token), token);
  }
  return [...codes.values()];
}

function separateExpiredMarkup(html) {
  const expiredChunks = [];
  let activeHtml = html.replace(
    /<(strike|s|del)\b[^>]*>([\s\S]*?)<\/\1>/gi,
    (_match, _tag, content) => {
      expiredChunks.push(content);
      return " ";
    },
  );

  activeHtml = activeHtml.replace(
    /<([a-z][\w:-]*)\b(?=[^>]*\bstyle=["'][^"']*text-decoration(?:-line)?\s*:[^"']*line-through)[^>]*>([\s\S]*?)<\/\1>/gi,
    (_match, _tag, content) => {
      expiredChunks.push(content);
      return " ";
    },
  );

  return { activeHtml, expiredHtml: expiredChunks.join("\n") };
}

function extractExpiredCodes(html) {
  const text = htmlToText(html);
  const codes = new Map();
  const tokens = text.match(/[A-Za-z0-9][A-Za-z0-9_-]{5,31}/g) ?? [];

  for (const token of tokens) {
    if (
      looksLikeCode(token) ||
      /^WWM[A-Za-z0-9_-]{3,28}$/i.test(token)
    ) {
      codes.set(normalizeCode(token), token);
    }
  }
  return [...codes.values()];
}

export function parseBahamutThread(html) {
  const firstFloorIndex = html.search(/data-floor=["']1["']/i);
  if (firstFloorIndex < 0) {
    throw new Error("找不到巴哈姆特一樓主文");
  }

  const firstFloorHtml = html.slice(firstFloorIndex);
  const articleMatch = firstFloorHtml.match(
    /<div\s+class=["'][^"']*\bc-article__content\b[^"']*["'][^>]*>([\s\S]*?)<\/article>/i,
  );
  if (!articleMatch) {
    throw new Error("找不到巴哈姆特一樓文章內容");
  }

  const { activeHtml, expiredHtml } = separateExpiredMarkup(articleMatch[1]);
  const activeCodes = extractCodes(htmlToText(activeHtml), true);
  const expiredCodes = extractExpiredCodes(expiredHtml);
  const entries = new Map();

  for (const code of activeCodes) {
    entries.set(normalizeCode(code), { code, status: "active" });
  }
  for (const code of expiredCodes) {
    entries.set(normalizeCode(code), { code, status: "expired" });
  }

  return [...entries.values()];
}

function validateSourceUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== SOURCE_HOST) {
    throw new Error("來源只能是巴哈姆特 HTTPS 網址");
  }
  return url;
}

export async function fetchBahamutEntries() {
  let url = validateSourceUrl(SOURCE_URL);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetch(url, {
      redirect: "manual",
      headers: {
        "accept-language": "zh-TW,zh;q=0.9",
        "user-agent": "WWM-Code-Monitor/2.0",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === MAX_REDIRECTS) {
        throw new Error("巴哈姆特重新導向失敗");
      }
      url = validateSourceUrl(new URL(location, url));
      continue;
    }
    if (!response.ok) {
      throw new Error(`巴哈姆特回傳 HTTP ${response.status}`);
    }

    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > MAX_SOURCE_BYTES) {
      throw new Error("巴哈姆特頁面超過 2 MB 限制");
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_SOURCE_BYTES) {
      throw new Error("巴哈姆特頁面超過 2 MB 限制");
    }
    return parseBahamutThread(new TextDecoder().decode(buffer));
  }

  throw new Error("巴哈姆特重新導向次數過多");
}

export function reconcileState(previousState, currentEntries, now) {
  const initialized = previousState?.initialized === true;
  const known = new Map(
    (previousState?.codes ?? []).map((entry) => [
      normalizeCode(entry.code),
      entry,
    ]),
  );
  const newActive = [];

  for (const entry of currentEntries) {
    const normalized = normalizeCode(entry.code);
    const previous = known.get(normalized);
    if (initialized && !previous && entry.status === "active") {
      newActive.push(entry);
    }

    known.set(normalized, {
      code: entry.code,
      status: entry.status,
      firstSeenAt: previous?.firstSeenAt ?? now,
      lastSeenAt: now,
    });
  }

  return {
    firstRun: !initialized,
    newActive,
    state: {
      initialized: true,
      sourceUrl: SOURCE_URL,
      updatedAt: now,
      codes: [...known.values()].sort((a, b) =>
        a.code.localeCompare(b.code, "en", { sensitivity: "base" }),
      ),
    },
  };
}

export { SOURCE_URL };
