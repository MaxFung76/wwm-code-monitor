import { fetchBahamutEntries, reconcileState, SOURCE_URL } from "./monitor.js";

const STATE_TITLE = "[WWM Monitor] State - do not edit";
const STATE_START = "<!-- wwm-code-state:start -->";
const STATE_END = "<!-- wwm-code-state:end -->";
const MAX_STATE_BYTES = 60_000;

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少必要的 GitHub Secret：${name}`);
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
    throw new Error(`GitHub 狀態儲存失敗：HTTP ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function encodeState(state) {
  const json = JSON.stringify(state, null, 2);
  const body = `${STATE_START}\n\`\`\`json\n${json}\n\`\`\`\n${STATE_END}`;
  if (Buffer.byteLength(body, "utf8") > MAX_STATE_BYTES) {
    throw new Error("去重狀態超過 GitHub Issue 容量限制");
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
  const match = section.match(/```json\s*([\s\S]*?)\s*```/);
  if (!match) throw new Error("GitHub 狀態 JSON 不存在");
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
    throw new Error(`Discord Webhook 發送失敗：HTTP ${response.status}`);
  }
}

async function main() {
  const repository = validateRepository(requireEnvironment("GH_REPOSITORY"));
  const githubToken = requireEnvironment("GH_STATE_TOKEN");
  const webhookUrl = validateWebhookUrl(
    requireEnvironment("DISCORD_WEBHOOK_URL"),
  );

  const entries = await fetchBahamutEntries();
  const stored = await loadStateIssue(repository, githubToken);
  const result = reconcileState(
    stored.state ?? { initialized: false, codes: [] },
    entries,
    new Date().toISOString(),
  );

  await saveState(repository, githubToken, stored.issue, result.state);

  if (result.firstRun) {
    await postDiscord(webhookUrl, {
      embeds: [
        {
          title: "兌換碼監控已啟用",
          description: `已建立 ${entries.length} 組代碼的去重基準，之後只公告新有效碼。`,
          color: 0x228be6,
          url: SOURCE_URL,
          timestamp: new Date().toISOString(),
        },
      ],
    });
  } else if (result.newActive.length > 0) {
    await postDiscord(webhookUrl, {
      embeds: [
        {
          title: "發現新兌換碼",
          description: result.newActive
            .map((entry) => `\`${entry.code}\``)
            .join("\n"),
          color: 0x2f9e44,
          url: SOURCE_URL,
          timestamp: new Date().toISOString(),
        },
      ],
    });
  }

  const active = entries.filter((entry) => entry.status === "active").length;
  const expired = entries.filter((entry) => entry.status === "expired").length;
  console.log(
    `掃描完成：有效 ${active}、過期 ${expired}、新增 ${result.newActive.length}`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
