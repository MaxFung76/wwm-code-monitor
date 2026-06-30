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
      username: "燕雲十六聲兌換碼監控",
      allowed_mentions: { parse: [] },
      ...payload,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Discord Webhook 回傳 HTTP ${response.status}`);
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
      sourceUrl: SOURCE_URL,
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
          url: SOURCE_URL,
          timestamp: new Date().toISOString(),
        },
      ],
    });
  }
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
      await postCodeEmbeds(webhookUrl, "手動新增兌換碼", result.newActive);
    }

    console.log(
      `手動同步完成：輸入 ${manualEntries.length} 組，新增 ${result.newActive.length} 組。`,
    );
    return;
  }

  const entries = await fetchBahamutEntries();
  const stored = await loadStateIssue(repository, githubToken);
  const result = reconcileState(
    stored.state ?? { initialized: false, codes: [] },
    entries,
    now,
  );

  await saveState(repository, githubToken, stored.issue, result.state);

  if (result.firstRun) {
    await postDiscord(webhookUrl, {
      embeds: [
        {
          title: "兌換碼監控已啟用",
          description: `已建立 ${entries.length} 組兌換碼基準資料。之後只會通知新出現的有效碼。`,
          color: 0x228be6,
          url: SOURCE_URL,
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
    `同步完成：有效 ${active} 組，過期 ${expired} 組，新增 ${result.newActive.length} 組。`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
