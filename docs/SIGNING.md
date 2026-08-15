# 代码签名与公证指南

未签名的安装包首次运行会被 macOS Gatekeeper / Windows SmartScreen 拦截。
本文说明如何为本项目配置 **Apple Developer ID 签名 + 公证** 与 **Windows Authenticode 签名**，
让用户获得"双击即开"的干净体验。

签名由 electron-builder 在构建时自动完成：**设置了对应密钥就签名，没设置就自动跳过（不报错）**。

---

## 一、macOS：Developer ID 签名 + 公证

### 1. 前置条件

- [Apple Developer Program](https://developer.apple.com/programs/) 会员（$99/年）
- 一台 Mac（生成证书请求用，你已有）

### 2. 创建 Developer ID Application 证书

1. 打开 **钥匙串访问（Keychain Access）** → 菜单栏 **证书助理 → 从证书颁发机构请求证书**
2. 填写你的邮箱、名字，选"存储到磁盘" → 生成 `CertificateSigningRequest.certSigningRequest`
3. 登录 [developer.apple.com](https://developer.apple.com) → **Certificates, Identifiers & Profiles** → 点 **+** → 选 **Developer ID Application** → 上传 CSR
4. 下载证书（`.cer`），双击导入钥匙串（导入到"登录"钥匙串）
5. 确认：钥匙串 → 我的证书 → 能看到 **"Developer ID Application: xxx"**，展开能看到私钥

### 3. 导出 .p12 并转 base64

```bash
# 钥匙串里右键证书 → 导出为 .p12（务必包含私钥，设置导出密码）
base64 -i certificate.p12 > certificate.p12.b64
```

### 4. 获取账号信息

| 需要 | 位置 |
| --- | --- |
| Team ID | developer.apple.com → Membership（形如 `ABCDE12345`） |
| App 专用密码 | [appleid.apple.com](https://appleid.apple.com) → 登录与安全 → App 专用密码 → 新建一个（名称随意，如 "electron-builder"） |

### 5. 配置 GitHub Secrets

仓库 → **Settings → Secrets and variables → Actions → New repository secret**：

| Secret | 值 |
| --- | --- |
| `MAC_CSC_LINK` | `certificate.p12.b64` 的**完整内容** |
| `MAC_CSC_KEY_PASSWORD` | p12 导出密码 |
| `APPLE_ID` | Apple 账号邮箱 |
| `APPLE_APP_SPECIFIC_PASSWORD` | App 专用密码 |
| `APPLE_TEAM_ID` | Team ID |

之后 CI 打 `v*` tag 就会自动产出**已签名 + 已公证**的 dmg/zip（公证需要几分钟）。

### 6. 本地签名测试（可选）

```bash
CSC_LINK="file:///absolute/path/certificate.p12" \
CSC_KEY_PASSWORD="密码" \
npx electron-builder --mac --arm64
```

### 7. 验证

```bash
codesign --verify --deep --strict "dist/mac-arm64/DeepSeek Harness.app"
spctl -a -vv "dist/mac-arm64/DeepSeek Harness.app"   # 应输出 accepted
# 公证结果：
xcrun notarytool history --apple-id "你的邮箱" --password "专用密码" --team-id "TEAMID"
```

---

## 二、Windows：Authenticode 签名

### 方案对比

| 方案 | 费用 | 说明 |
| --- | --- | --- |
| **OV 证书**（DigiCert / Sectigo / GlobalSign） | 约 $100–300/年 | 最常规；验证组织身份；CI 里用 pfx 签名 |
| **EV 证书** | 贵（$300+/年） | 需硬件令牌，SmartScreen 信任度最高；CI 里签名困难，通常配合云 HSM |
| **Azure Trusted Signing**（推荐 OSS） | 约 $10/月 | 微软云签名，EV 级信任，纯 CI 友好；electron-builder 原生支持 |
| **SignPath** | 开源项目免费 | 上传未签名产物、回传签名产物；适合 GitHub 开源项目 |
| 自签名 | 免费 | 无法消除 SmartScreen 警告，仅内部测试用 |

### 方案 A：OV 证书（经典做法）

1. 向 CA 购买 **Code Signing** 证书（申请时需要公司/组织资料，个人可用个人名义 OV）
2. 拿到 CA 签发的 `.pfx`（或 `.cer` + 私钥后自行合成 `.pfx`）
3. 转 base64 并配置 Secrets：

```bash
base64 -i certificate.pfx > certificate.pfx.b64
```

| Secret | 值 |
| --- | --- |
| `WIN_CSC_LINK` | `certificate.pfx.b64` 的完整内容 |
| `WIN_CSC_KEY_PASSWORD` | pfx 密码 |

### 方案 B：Azure Trusted Signing（CI 友好，推荐开源项目）

1. 在 [Azure Portal](https://portal.azure.com) 创建 **Code Signing Account**（区域选美国东部等支持区）→ 创建 Certificate Profile（信任级别选 "Public Trust"）
2. 创建服务主体（App Registration），记录 `Client ID`、`Tenant ID`、`Client Secret`
3. 在 `package.json` 的 `build.win` 增加：

```json
"win": {
  "azureTrustedSigning": {
    "azureClientId": "你的 Client ID",
    "azureClientSecret": "你的 Client Secret",
    "azureTenantId": "你的 Tenant ID",
    "azureCertificateName": "证书 Profile 名",
    "azureEndpoint": "https://eus.codesigning.azure.net",
    "trustLevel": "restrictedSigning"
  }
}
```

（密钥不要写死在 package.json——应通过环境变量注入，或在 CI 里用 secret 拼接覆盖）

### 验证

```powershell
# PowerShell
Get-AuthenticodeSignature "dist\win-unpacked\DeepSeek Harness.exe"
# 或 signtool（Windows SDK）
signtool verify /pa /v "DeepSeek Harness.exe"
```

> **注意**：即使是有效签名，新证书在 SmartScreen 里仍可能提示"未知发布者"一段时间——
> 微软根据签名量积累信誉，EV 或 Azure Trusted Signing 能更快获得信任。

---

## 三、发布流程

```bash
git tag v0.3.0
git push origin v0.3.0
```

CI 会自动：构建 → 签名 → 公证 → 上传三平台安装包到 Artifact。
之后在 GitHub Releases 页面创建 Release，把 Artifact 里的安装包附上即可。

## 四、常见问题

| 问题 | 处理 |
| --- | --- |
| 日志出现 `skipped macOS code signing` | 正常：没配证书时自动跳过，构建不受影响 |
| 公证报 `ERROR ITMS-90717` / entitlements 问题 | 确认 `hardenedRuntime: true`（已配置）；必要时显式提供 `entitlements` 文件 |
| `Cannot find identity` | `CSC_LINK` 的 base64 不完整，或 p12 与 CSR 不是同一台机器导出 |
| Windows 签名报证书不可用 | 确认 pfx 包含私钥且密码正确；OV 证书需同时安装中间证书链 |
| 想本地验证 mac 公证 | 用 `xcrun notarytool` 提交/查询（见上文验证小节） |
