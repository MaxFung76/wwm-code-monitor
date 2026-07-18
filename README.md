# 燕雲十六聲兌換碼監控器

這是一個使用 GitHub Actions、GitHub Issue、Discord Webhook 與 Cloudflare Worker 的兌換碼監控工具。

目前版本不再自動抓巴哈姆特，改用下列兩個來源：

- https://www.arlenfuture.com/games/where-winds-meet-codes/
- https://www.pcgamer.com/games/action/where-winds-meet-codes/

## 功能

- 每 6 小時自動掃描 Arlen 與 PC Gamer 的兌換碼頁面。
- 自動比對 GitHub Issue 裡已記錄的兌換碼。
- 只有新出現的有效碼會發布到 Discord。
- 已存在的兌換碼不會重複公告。
- 來源網站標示為過期或失效的兌換碼，會從 Issue 狀態中刪除。
- 支援 Discord `/report`，玩家可以直接回報疑似新兌換碼。
- `/report` 回報的兌換碼一樣會先比對，沒記錄過才會公告。

## 運作方式

```text
Arlen / PC Gamer
GitHub Actions
GitHub Issue 狀態資料
Discord Webhook 公告
```

玩家回報流程：

```text
Discord /report
Cloudflare Worker
GitHub Actions manual_codes
GitHub Issue 比對
Discord Webhook 公告
```

## GitHub Issue 狀態

程式會自動建立或更新一個 Issue：

```text
[WWM Monitor] State - do not edit
```

這個 Issue 用來記錄目前已知的有效兌換碼。請不要手動亂改裡面的 JSON，除非你知道自己在改什麼。

## 必要設定

在 GitHub repository 的 `Settings` -> `Environments` 建立：

```text
discord-production
```

並新增 Environment Secret：

```text
DISCORD_WEBHOOK_URL
```

Value 填 Discord 頻道的 Webhook URL。

## 手動新增兌換碼

到 GitHub：

```text
Actions -> Scan WWM redemption codes -> Run workflow
```

在 `manual_codes` 欄位貼上兌換碼，一行一組或多組都可以。

系統會自動比對：

- 新碼會寫入 Issue 並公告到 Discord。
- 重複碼只會更新紀錄，不會重複公告。

## Discord `/report`

`discord-report-worker/` 是 Cloudflare Worker 版本的 Discord `/report` 功能。

玩家可以在 Discord 使用：

```text
/report
```

把疑似新兌換碼貼進 `codes` 欄位。Worker 會觸發 GitHub Actions 的 `manual_codes` 流程，再由 GitHub Actions 負責比對與公告。

設定方式請看：

```text
discord-report-worker/README.md
```

## 排程

目前 GitHub Actions 每 6 小時執行一次：

```yaml
cron: "17 0,6,12,18 * * *"
```

GitHub Actions 的排程使用 UTC 時間，所以實際觸發時間會和台灣時間相差 8 小時。

## 安全提醒

請不要把下列內容上傳到 GitHub：

- Discord Webhook URL
- Discord Bot Token
- GitHub Token
- `.env`
- 任何 API Key 或私密金鑰

這些資料應該放在 GitHub Secrets 或 Cloudflare Worker Secrets。

如果 Token 或 Webhook URL 不小心公開，請立刻重設。

## License

MIT License
