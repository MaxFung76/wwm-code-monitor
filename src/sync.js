import {
  ARLEN_URL,
  fetchArlenEntries,
  fetchPcGamerEntries,
  normalizeCode,
  PC_GAMER_URL,
  reconcileState,
} from "./monitor.js";

const STATE_TITLE = "[WWM Monitor] State - do not edit";
const STATE_START = "<!-- wwm-code-state:start -->";
const STATE_END = "<!-- wwm-code-state:end -->";
const MAX_STATE_BYTES = 60_000;
const MAX_EMBED_DESCRIPTION = 3900;
const ANNOUNCEMENT_SOURCE_URL = ARLEN_URL;
const STATE_SOURCE_URL = `${ARLEN_URL} | ${PC_GAMER_URL}`;

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function validateRepository(value) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error("GitHub repository format is invalid");
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
    throw new Error("DISCORD_WEBHOOK_URL format is invalid");
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
    throw new Error(`GitHub API returned HTTP ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function encodeState(state) {
  const json = JSON.stringify(state, null, 2);
  const body = `${STATE_START}\n\`\`\`json\n${json}\n\`\`\`\n${STATE_END}`;
  if (Buffer.byteLength(body, "utf8") > MAX_STATE_BYTES) {
    throw new Error("State data is too large for the GitHub Issue");
  }
  return body;
}

function decodeState(body) {
  const start = body.indexOf(STATE_START);
  const end = body.indexOf(STATE_END);
  if (start < 0 || end <= start) {
    throw new Error("GitHub state issue format is invalid");
  }

  const section = body.slice(start + STATE_START.length, end);
  const match = section.match(/```json\s*([\s\S]*?)\s*```/);
  if (!match) throw new Error("GitHub state JSON block was not found");
  return JSON.parse(match[1]);
}

async function loadStateIssue(repository, token) {
  const issues = await githubRequest(
    repository,
    token,
    "/issues?state=open&per_page=100",
  );
  const issue = issues.find(
    (item) => !item.pull_request && item.title === STATE_TITLE,
  );
  if (!issue) return { issue: null, state: null };
  return { issue, state: decodeState(issue.body ?? "") };
}

async function saveState(repository, token, issue, state) {
  const body = JSON.stringify({ title: STATE_TITLE, body: encodeState(state) });
  if (issue) {
    return githubRequest(repository, token, `/issues/${issue.number}`, {
      method: "PATCH",
      body,
    });
  }
  return githubRequest(repository, token, "/issues", {
    method: "POST",
    body,
  });
}

async function postDiscord(webhookUrl, payload) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "燕雲十六聲兌換碼",
      allowed_mentions: { parse: [] },
      ...payload,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Discord Webhook returned HTTP ${response.status}`);
  }
}

function reconcileManualState(previousState, manualEntries, now) {
  const known = new Map(
    (previousState?.codes ?? []).map((entry) => [
      normalizeCode(entry.code),
      entry,
    ]),
  );
  const newActive = [];

  for (const entry of manualEntries) {
    const normalized = normalizeCode(entry.code);
    const previous = known.get(normalized);
    if (!previous) newActive.push(entry);

    known.set(normalized, {
      code: entry.code,
      status: "active",
      firstSeenAt: previous?.firstSeenAt ?? now,
      lastSeenAt: now,
    });
  }

  return {
    newActive,
    state: {
      initialized: true,
      sourceUrl: STATE_SOURCE_URL,
      updatedAt: now,
      codes: [...known.values()].sort((a, b) =>
        a.code.localeCompare(b.code, "en", { sensitivity: "base" }),
      ),
    },
  };
}

function chunkCodeLines(entries) {
  const chunks = [];
  let current = [];
  let currentLength = 0;

  for (const entry of entries) {
    const line = `\`${entry.code}\``;
    const nextLength = currentLength + line.length + 1;
    if (current.length > 0 && nextLength > MAX_EMBED_DESCRIPTION) {
      chunks.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(line);
    currentLength += line.length + 1;
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

async function postCodeEmbeds(webhookUrl, title, entries) {
  for (const lines of chunkCodeLines(entries)) {
    await postDiscord(webhookUrl, {
      embeds: [
        {
          title,
          description: lines.join("\n"),
          color: 0x2f9e44,
          url: ANNOUNCEMENT_SOURCE_URL,
          timestamp: new Date().toISOString(),
        },
      ],
    });
  }
}

function isTemporarySourceBlock(error) {
  return /HTTP (403|429)\b/.test(error?.message ?? "");
}

function isSourceScanEnabled() {
  return process.env.SOURCE_SCAN_ENABLED !== "false";
}

function mergeSourceEntries(target, entries) {
  for (const entry of entries) {
    const normalized = normalizeCode(entry.code);
    const previous = target.get(normalized);
    if (previous?.status === "expired") continue;

    if (!previous || entry.status === "expired") {
      target.set(normalized, {
        code: normalized,
        status: entry.status,
      });
    }
  }
}

async function fetchConfiguredSourceEntries() {
  const sources = [
    { name: "Arlen", fetchEntries: fetchArlenEntries },
    { name: "PC Gamer", fetchEntries: fetchPcGamerEntries },
  ];
  const entries = new Map();
  const failures = [];

  for (const source of sources) {
    try {
      const sourceEntries = await source.fetchEntries();
      mergeSourceEntries(entries, sourceEntries);

      const active = sourceEntries.filter(
        (entry) => entry.status === "active",
      ).length;
      const expired = sourceEntries.filter(
        (entry) => entry.status === "expired",
      ).length;
      console.log(
        `${source.name} source loaded: ${active} active, ${expired} expired.`,
      );
    } catch (error) {
      failures.push(`${source.name}: ${error.message}`);
      console.warn(`${source.name} source failed: ${error.message}`);
    }
  }

  if (entries.size === 0) {
    throw new Error(`All configured sources failed. ${failures.join(" | ")}`);
  }

  return [...entries.values()];
}

async function main() {
  const repository = validateRepository(requireEnvironment("GH_REPOSITORY"));
  const githubToken = requireEnvironment("GH_STATE_TOKEN");
  const webhookUrl = validateWebhookUrl(
    requireEnvironment("DISCORD_WEBHOOK_URL"),
  );
  const now = new Date().toISOString();
  const manualEntries = parseManualEntries(process.env.MANUAL_CODES);

  if (manualEntries.length > 0) {
    const stored = await loadStateIssue(repository, githubToken);
    const result = reconcileManualState(
      stored.state ?? { initialized: false, codes: [] },
      manualEntries,
      now,
    );

    await saveState(repository, githubToken, stored.issue, result.state);

    if (result.newActive.length > 0) {
      await postCodeEmbeds(webhookUrl, "玩家回報新兌換碼", result.newActive);
    }

    console.log(
      `Manual report checked ${manualEntries.length} code(s), added ${result.newActive.length}.`,
    );
    return;
  }

  if (!isSourceScanEnabled()) {
    console.log(
      "Source scanning is disabled. Manual /report submissions still work.",
    );
    return;
  }

  let entries;
  try {
    entries = await fetchConfiguredSourceEntries();
  } catch (error) {
    if (!isTemporarySourceBlock(error)) throw error;

    console.warn(`Source temporarily blocked: ${error.message}`);
    console.warn("This run was skipped. Manual /report still works.");
    return;
  }

  const stored = await loadStateIssue(repository, githubToken);
  const result = reconcileState(
    stored.state ?? { initialized: false, codes: [] },
    entries,
    now,
    STATE_SOURCE_URL,
  );

  await saveState(repository, githubToken, stored.issue, result.state);

  if (result.firstRun) {
    await postDiscord(webhookUrl, {
      embeds: [
        {
          title: "兌換碼監控已建立",
          description: `已建立 ${entries.length} 組兌換碼基準資料。之後只會通知新出現的有效碼。`,
          color: 0x228be6,
          url: ANNOUNCEMENT_SOURCE_URL,
          timestamp: new Date().toISOString(),
        },
      ],
    });
  } else if (result.newActive.length > 0) {
    await postCodeEmbeds(webhookUrl, "發現新兌換碼", result.newActive);
  }

  const active = entries.filter((entry) => entry.status === "active").length;
  const expired = entries.filter((entry) => entry.status === "expired").length;
  console.log(
    `Source sync complete: ${active} active, ${expired} expired, ${result.newActive.length} new.`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
