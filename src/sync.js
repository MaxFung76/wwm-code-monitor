import {
  fetchBahamutEntries,
  normalizeCode,
  reconcileState,
  SOURCE_URL,
} from "./monitor.js";

const STATE_TITLE = "[WWM Monitor] State - do not edit";
const STATE_START = "<!-- wwm-code-state:start -->";
const STATE_END = "<!-- wwm-code-state:end -->";
const MAX_STATE_BYTES = 60_000;
const MAX_EMBED_DESCRIPTION = 3900;

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少 GitHub Secret 或環境變數：${name}`);
  return value;
}

function validateRepository(value) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error("GitHub repository 格式不正確");
  }
  return value.split("/").map(encodeURIComponent).join("/");
}

function validateWebhookUrl(value) {
  const url = new URL(value);
  const parts = url.pathname.split("/").filter(Boolean);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "discord.com" ||
    url.search ||
    url.hash ||
    parts.length !== 4 ||
    parts[0] !== "api" ||
    parts[1] !== "webhooks" ||
    !/^\d+$/.test(parts[2]) ||
    !/^[A-Za-z0-9._-]{20,}$/.test(parts[3])
  ) {
    throw new Error("DISCORD_WEBHOOK_URL 格式不正確");
  }
  return url.toString();
}

function parseManualEntries(value) {
  const tokens = value?.match(/[A-Za-z0-9][A-Za-z0-9_-]{5,31}/g) ?? [];
  const entries = new Map();

  for (const token of tokens) {
    entries.set(normalizeCode(token), {
      code: token.trim(),
      status: "active",
    });
  }

  return [...entries.values()];
}

async function githubRequest(repository, token, path, options = {}) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}${path}`,
    {
      ...options,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "wwm-code-monitor",
        "x-github-api-version": "2022-11-28",
        ...options.headers,
      },
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    throw new Error(`GitHub API 回傳 HTTP ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function encodeState(state) {
  const json = JSON.stringify(state, null, 2);
  const body = `${STATE_START}\n\`\`\`json\n${json}\n\`\`\`\n${STATE_END}`;
  if (Buffer.byteLength(body, "utf8") > MAX_STATE_BYTES) {
    throw new Error("狀態資料超過 GitHub Issue 大小限制");
  }
  return body;
}

function decodeState(body) {
  const start = body.indexOf(STATE_START);
  const end = body.indexOf(STATE_END);
  if (start < 0 || end <= start) {
    throw new Error("GitHub 狀態 Issue 格式不正確");
  }

  const section = body.slice(start + STATE_START.length, end);
