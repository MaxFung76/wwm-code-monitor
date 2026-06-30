# 燕雲十六聲兌換碼監控器

這是一個使用 GitHub Actions 執行的《燕雲十六聲》兌換碼監控器。它會定時檢查指定的巴哈姆特文章，發現新兌換碼後透過 Discord Webhook 發送到指定頻道。

這不是全天在線的 Discord Bot，不需要 Discord Bot Token，也不需要自己開電腦掛程式。

## 功能

- 每 1 小時自動掃描一次兌換碼來源。
- 可在 GitHub Actions 手動執行。
- 支援手動貼上兌換碼發布到 Discord。
- 發送前會先比對 GitHub Issue 裡的紀錄，已經發過的碼不會重複通知。
- 自動把新碼寫回 GitHub Issue，作為下次比對用的紀錄。
- 透過 Discord Webhook 發送通知，不使用 Discord Bot Token。
- 不需要資料庫、不需要伺服器、不需要本機長時間開機。

## 運作方式

本專案會使用一個 GitHub Issue 儲存已記錄的兌換碼，Issue 標題是：

```text
[WWM Monitor] State - do not edit
```

請不要刪除或隨意編輯這個 Issue。  
如果你知道自己在做什麼，也可以手動調整裡面的 JSON 狀態，例如移除某個碼讓它重新被判定為新碼。

## 安裝方式

### 1. Fork 專案

如果你想部署到自己的 Discord 頻道，請先 Fork 這個專案到自己的 GitHub 帳號。

不要要求原作者把你的 Webhook 加到原作者的 repository，否則會消耗原作者的 GitHub Actions 額度。

Fork 後，Actions 執行額度會算在你自己的 GitHub 帳號或組織底下。

### 2. 建立 Discord Webhook

1. 到你想發布兌換碼的 Discord 頻道。
2. 開啟頻道設定。
3. 找到 `整合` 或 `Integrations`。
4. 建立 Webhook。
5. 複製 Webhook URL。

請不要把 Webhook URL 貼到公開聊天、README、Issue、程式碼或截圖裡。Webhook URL 等同於可以往該頻道發訊息的密鑰。

### 3. 設定 GitHub Environment Secret

1. 到你的 GitHub repository。
2. 進入 `Settings` -> `Environments`。
3. 建立 environment：

```text
discord-production
```

4. 在 `Environment secrets` 新增：

```text
Name: DISCORD_WEBHOOK_URL
Value: 你的 Discord Webhook URL
```

5. 建議把 deployment branch 限制為：

```text
main
```

### 4. 啟用 GitHub Actions

1. 進入 repository 的 `Actions` 分頁。
2. 如果 GitHub 要求你啟用 Actions，按下啟用。
3. 選擇 `Scan WWM redemption codes`。
4. 按 `Run workflow` 測試。

第一次執行時，程式會建立基準紀錄，不會把所有舊碼洗版發出去。之後才會通知新出現的兌換碼。

## 手動發布兌換碼

如果你手上有新的兌換碼，想直接發布到 Discord：

1. 到 GitHub repository 的 `Actions`。
2. 選擇 `Scan WWM redemption codes`。
3. 按 `Run workflow`。
4. 在 `manual_codes` 欄位貼上兌換碼。
5. 按下執行。

可以一次貼多組，例如：

```text
WWMREDDIT0625
FHKD7HHWRJ
HD8PHDX443
```

手動發布時也會先比對 GitHub Issue：

- 已存在的兌換碼不會重複發送。
- 不存在的新兌換碼才會發到 Discord。
- 發送後會自動寫入 Issue，避免下次重複發送。

## 自動掃描

目前排程是每小時一次：

```yaml
cron: "17 * * * *"
```

GitHub Actions 的排程時間使用 UTC，而且可能會有幾分鐘延遲，這是 GitHub 的正常行為。

## 常見問題

### 為什麼我手動貼進 Issue 後沒有發 Discord？

Issue 是已記錄清單，不是發布入口。  
把碼加進 Issue 代表「已經看過」，所以不會發送。

要手動發布請用 Actions 的 `Run workflow`，並把兌換碼貼到 `manual_codes`。

### 別人使用會消耗我的 GitHub Actions 額度嗎？

如果他們 Fork 到自己的 GitHub 帳號並在自己的 repository 執行，就會消耗他們自己的額度。

如果你把別人加進你的 repository，或幫很多 Discord 伺服器共用同一個 repository，就會消耗你的額度。

### 可以公開 repository 嗎？

可以，但請先確認 repository 內沒有：

- `.env`
- Discord Webhook URL
- Discord Bot Token
- 任何 API key 或密碼

Webhook URL 應該只存在 GitHub Environment Secret。

## 安全提醒

- 不要把 `DISCORD_WEBHOOK_URL` 放進程式碼。
- 不要把 `DISCORD_WEBHOOK_URL` 貼到 Issue 或 README。
- 不要把 Webhook URL 截圖公開。
- 如果 Webhook 外洩，請到 Discord 刪除舊 Webhook，建立新的，再更新 GitHub Secret。

更多安全注意事項請看 [SECURITY.md](SECURITY.md)。

## 授權

MIT License

## Discord `/report` 回報功能

如果想讓玩家直接在 Discord 用 `/report` 回報疑似兌換碼，可以使用本專案內的：

```text
discord-report-worker/
```

它是一個 Cloudflare Worker，負責接收 Discord Slash Command，然後把玩家貼上的兌換碼送到本專案的 GitHub Actions `manual_codes` 流程。

流程是：

```text
玩家 /report
Cloudflare Worker
GitHub Actions manual_codes
比對 GitHub Issue
新碼才發 Discord 公告
```

詳細部署方式請看：

```text
discord-report-worker/README.md
```
