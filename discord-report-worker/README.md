# 燕雲十六聲 `/report` 回報機器人

這是一個 Discord Slash Command 回報入口。玩家在 Discord 打：

```text
/report codes: WWMREDDIT0625
```

或一次貼多組：

```text
/report codes:
WWMREDDIT0625
FHKD7HHWRJ
HD8PHDX443
```

這個 Worker 會把玩家回報的兌換碼送到 GitHub Actions 的 `manual_codes` 流程。真正的比對、寫入 GitHub Issue、發 Discord 公告，仍然交給原本的 `wwm-code-monitor` 專案處理。

## 優點

- 玩家不用會 GitHub。
- 你不用開電腦掛 Discord Bot。
- 不需要讓 Worker 知道 Discord Webhook URL。
- 不需要讓玩家接觸任何密鑰。
- 已回報過的碼會由原本監控器比對，不會重複公告。

## 前置條件

你的 `wwm-code-monitor` 專案需要已經支援 GitHub Actions 的 `manual_codes` 輸入欄位。

確認 `.github/workflows/sync-codes.yml` 裡有：

```yaml
workflow_dispatch:
  inputs:
    manual_codes:
      description: "Optional: paste codes here to publish them manually"
      required: false
      type: string
```

也要確認 `src/sync.js` 已經是手動發布版本，會讀取 `MANUAL_CODES`。

## 需要的密鑰

Cloudflare Worker 需要設定：

```text
DISCORD_PUBLIC_KEY
GITHUB_TOKEN
```

Worker 變數需要設定：

```text
GITHUB_REPOSITORY=Detion0115/wwm-code-monitor
GITHUB_REF=main
GITHUB_WORKFLOW_ID=sync-codes.yml
```

可選：

```text
ALLOWED_GUILD_ID=你的 Discord 伺服器 ID
ALLOWED_CHANNEL_IDS=允許使用 /report 的頻道 ID，多個用逗號分隔
```

## GitHub Token 權限

`GITHUB_TOKEN` 建議使用 fine-grained personal access token，只給你的 `wwm-code-monitor` repository 使用。

需要的權限：

```text
Actions: Read and write
Metadata: Read-only
```

這個 token 只用來觸發 GitHub Actions workflow，不需要放 Discord Webhook URL。

## Discord 設定

1. 到 Discord Developer Portal。
2. 打開你的 Application。
3. 到 `General Information` 複製 `Public Key`，放進 Cloudflare Secret：`DISCORD_PUBLIC_KEY`。
4. Cloudflare Worker 部署後，把 Worker URL 貼到 Discord Application 的 `Interactions Endpoint URL`。
5. 儲存成功後，Discord 會自動測試 endpoint。
6. 使用 `scripts/register-command.js` 註冊 `/report` 指令。

## 註冊 `/report` 指令

需要一次性使用 Discord Bot Token 來註冊 slash command。

本機 PowerShell 範例：

```powershell
$env:DISCORD_BOT_TOKEN="你的BotToken"
$env:DISCORD_CLIENT_ID="你的ApplicationID"
$env:DISCORD_GUILD_ID="你的測試伺服器ID"
node scripts/register-command.js
```

有填 `DISCORD_GUILD_ID` 時，指令只會註冊到該伺服器，通常幾秒內生效。  
不填 `DISCORD_GUILD_ID` 時會註冊成全域指令，可能需要比較久才會出現。

## 玩家使用方式

玩家只要在 Discord 打：

```text
/report codes: 兌換碼
```

送出後會看到只有自己看得到的回覆：

```text
已收到 X 組兌換碼，正在交給監控器比對。若是新碼，會自動發布到公告頻道。
```

如果兌換碼是新的，原本的 GitHub Actions 監控器會發到公告頻道。  
如果已經記錄過，就不會重複公告。

## 安全提醒

- 不要把 `DISCORD_PUBLIC_KEY` 以外的密鑰寫進程式碼。
- 不要把 `GITHUB_TOKEN` 貼到 Discord 或 GitHub Issue。
- 建議限制 `ALLOWED_GUILD_ID` 和 `ALLOWED_CHANNEL_IDS`，避免其他地方亂用。
- 如果 GitHub Token 外洩，請立刻撤銷並重新建立。
