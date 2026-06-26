# 燕雲十六聲兌換碼監控器

這是專門給 GitHub Actions 使用的免費精簡版。它不是全天在線的 Discord
Bot，不提供 `/code` 指令，也不需要 Discord Bot Token。

## 功能

- 每 60 分鐘掃描指定巴哈姆特文章的一樓。
- 找出新增的兌換碼並透過 Discord Webhook 公告。
- 大小寫不敏感去重。
- 刪除線代碼記為已過期，不會公告成新碼。
- 第一次執行只建立基準，不會一次發布全部舊碼。
- 第一次成功後，Discord 會收到「兌換碼監控已啟用」。
- 去重資料存放在 GitHub 專案的一個專用 Issue。
- 不使用資料庫、Docker、Discord Bot Token 或 npm 第三方套件。

## 這是給自己用，還是分享給別人？

兩種都可以，但運作方式不同：

### 自己部署

你將檔案上傳到自己的 GitHub 專案，設定自己的 Discord Webhook。GitHub
Actions 會替你定時執行，訊息只送到你的 Discord 頻道。

### 分享給別人

你可以把這份 ZIP 分享給別人。每個人都必須：

1. 建立自己的 GitHub 專案。
2. 建立自己的 Discord Webhook。
3. 將自己的 Webhook 存成 GitHub Secret。

你不需要、也不應該把自己的 Webhook 或 Bot Token交給別人。這不是一個
大家共用的中央服務，而是一份可讓每個人自行部署的程式模板。

## 安裝

### 1. 建立 GitHub 專案

1. 前往 <https://github.com/new>。
2. 名稱可填 `wwm-code-monitor`。
3. 建議選擇 **Private**。
4. 不要預先建立 README、`.gitignore` 或 License。
5. 建立後，把本 ZIP 解壓縮，再上傳解壓後的全部內容。
6. 確認專案的 **Issues** 功能保持開啟。

請勿直接上傳 ZIP 檔本身。GitHub 中應看得到 `.github/workflows`、`src`
與 `test` 資料夾。

### 2. 建立 Discord Webhook

1. Discord 伺服器設定 → 整合 → Webhook。
2. 建立 Webhook，選擇接收通知的頻道。
3. 複製 Webhook 網址。

Webhook 網址等同該頻道的發訊息密碼，不要公開。

### 3. 建立 GitHub Environment Secret

1. GitHub 專案 → Settings → Environments。
2. 建立名為 `discord-production` 的 Environment。
3. 在 Deployment branches 設定只允許預設分支，例如 `main`。
4. 在 Environment secrets 新增：
   - Name：`DISCORD_WEBHOOK_URL`
   - Value：剛才複製的 Discord Webhook 網址

不要把 Webhook 放在一般檔案、Issues 或 Actions Variables。

### 4. 等待第一次執行

工作流程只接受安全的定時排程，沒有手動執行按鈕。它會在每小時第 17 分執行，GitHub 忙碌時可能延遲幾分鐘。

第一次成功後：

- GitHub Issues 會出現 `[WWM Monitor] State - do not edit`。
- Discord 會收到「兌換碼監控已啟用」。

## 安全設計

- GitHub Token 只有讀取程式與寫入 Issues 的權限，不能修改程式碼。
- Webhook 只注入執行掃描的步驟，不會寫入檔案或 Issue。
- 工作流程只能由預設分支的排程啟動。
- 官方 GitHub Actions 固定到不可變 commit SHA。
- Checkout 不保存 Git 認證資料。
- 來源限制為巴哈姆特 HTTPS 網址。
- 所有 Discord mention 都被停用。

更多注意事項請閱讀 [SECURITY.md](SECURITY.md)。

本專案使用 MIT License，可分享及修改；分享時不要附上自己的 Webhook。
