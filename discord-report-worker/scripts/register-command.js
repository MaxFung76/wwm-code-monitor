const token = requireEnv("DISCORD_BOT_TOKEN");
const clientId = requireEnv("DISCORD_CLIENT_ID");
const guildId = process.env.DISCORD_GUILD_ID?.trim();

const command = {
  name: "report",
  description: "回報燕雲十六聲兌換碼",
  options: [
    {
      type: 3,
      name: "codes",
      description: "貼上一組或多組疑似兌換碼",
      required: true,
    },
  ],
};

const route = guildId
  ? `https://discord.com/api/v10/applications/${clientId}/guilds/${guildId}/commands`
  : `https://discord.com/api/v10/applications/${clientId}/commands`;

const response = await fetch(route, {
  method: "POST",
  headers: {
    authorization: `Bot ${token}`,
    "content-type": "application/json",
  },
  body: JSON.stringify(command),
});

if (!response.ok) {
  console.error(await response.text());
  process.exitCode = 1;
} else {
  console.log(guildId ? "Guild /report command registered." : "Global /report command registered.");
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}
