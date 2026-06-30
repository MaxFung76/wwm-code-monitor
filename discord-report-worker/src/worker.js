const DISCORD_PING = 1;
const DISCORD_APPLICATION_COMMAND = 2;
const DISCORD_PONG = 1;
const DISCORD_CHANNEL_MESSAGE_WITH_SOURCE = 4;
const EPHEMERAL = 1 << 6;
const MAX_CODES_PER_REPORT = 50;

export default {
  async fetch(request, env) {
    if (request.method === "GET") {
      return new Response("WWM report endpoint is running.");
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const signature = request.headers.get("x-signature-ed25519");
    const timestamp = request.headers.get("x-signature-timestamp");
    const body = await request.text();

    const isValid = await verifyDiscordRequest({
      body,
      publicKey: requireEnv(env, "DISCORD_PUBLIC_KEY"),
      signature,
      timestamp,
    });

    if (!isValid) {
      return new Response("Bad request signature", { status: 401 });
    }

    const interaction = JSON.parse(body);
    if (interaction.type === DISCORD_PING) {
      return json({ type: DISCORD_PONG });
    }

    if (interaction.type !== DISCORD_APPLICATION_COMMAND) {
      return reply("這個互動類型目前不支援。");
    }

    if (interaction.data?.name !== "report") {
      return reply("未知指令。");
    }

    if (!isAllowedLocation(interaction, env)) {
      return reply("這個頻道目前不能使用 /report 回報兌換碼。");
    }

    const rawCodes = getStringOption(interaction, "codes");
    const entries = parseCodes(rawCodes);

    if (entries.length === 0) {
      return reply("沒有找到疑似兌換碼，請貼上英數字兌換碼。");
    }

    if (entries.length > MAX_CODES_PER_REPORT) {
      return reply(`一次最多回報 ${MAX_CODES_PER_REPORT} 組兌換碼。`);
    }

    try {
      await dispatchGitHubWorkflow(env, entries.map((entry) => entry.code));
    } catch (error) {
      console.error(error);
      return reply("送出失敗，請稍後再試或通知管理員。");
    }

    return reply(
      `已收到 ${entries.length} 組兌換碼，正在交給監控器比對。若是新碼，會自動發布到公告頻道。`,
    );
  },
};

function requireEnv(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function json(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

function reply(content) {
  return json({
    type: DISCORD_CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content,
      flags: EPHEMERAL,
      allowed_mentions: { parse: [] },
    },
  });
}

function getStringOption(interaction, name) {
  return interaction.data?.options?.find((option) => option.name === name)
    ?.value ?? "";
}

function normalizeCode(value) {
  return value.trim().toUpperCase();
}

function parseCodes(value) {
  const tokens = value?.match(/[A-Za-z0-9][A-Za-z0-9_-]{5,31}/g) ?? [];
  const entries = new Map();

  for (const token of tokens) {
    entries.set(normalizeCode(token), { code: token.trim() });
  }

  return [...entries.values()];
}

function isAllowedLocation(interaction, env) {
  const allowedGuildId = env.ALLOWED_GUILD_ID?.trim();
  if (allowedGuildId && interaction.guild_id !== allowedGuildId) {
    return false;
  }

  const allowedChannelIds = (env.ALLOWED_CHANNEL_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (
    allowedChannelIds.length > 0 &&
    !allowedChannelIds.includes(interaction.channel_id)
  ) {
    return false;
  }

  return true;
}

async function dispatchGitHubWorkflow(env, codes) {
  const repository = requireEnv(env, "GITHUB_REPOSITORY");
  const workflowId = env.GITHUB_WORKFLOW_ID?.trim() || "sync-codes.yml";
  const ref = env.GITHUB_REF?.trim() || "main";
  const token = requireEnv(env, "GITHUB_TOKEN");

  const response = await fetch(
    `https://api.github.com/repos/${repository}/actions/workflows/${workflowId}/dispatches`,
    {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "wwm-report-discord-worker",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({
        ref,
        inputs: {
          manual_codes: codes.join("\n"),
        },
      }),
    },
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`GitHub workflow dispatch failed: ${response.status} ${message}`);
  }
}

async function verifyDiscordRequest({
  body,
  publicKey,
  signature,
  timestamp,
}) {
  if (!signature || !timestamp) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    hexToBytes(publicKey),
    { name: "Ed25519" },
    false,
    ["verify"],
  );

  const data = new TextEncoder().encode(`${timestamp}${body}`);
  return crypto.subtle.verify(
    { name: "Ed25519" },
    key,
    hexToBytes(signature),
    data,
  );
}

function hexToBytes(hex) {
  if (!/^[\da-f]+$/i.test(hex) || hex.length % 2 !== 0) {
    throw new Error("Invalid hex value");
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
