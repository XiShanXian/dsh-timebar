# dsh-timebar

> 在 DeepSeek Harness 界面顶部画一条 **24 小时 API 峰谷价格时间条**，让你一眼看到"现在这一刻，调用是高峰价还是低谷价"。

DeepSeek 的 API 计费分高峰/低谷两档（低谷价约为高峰价的 50%）。时段规则并不直观——它排除了法定节假日，还把"调休上班的周末"也算作低谷。这个插件把规则画成一条横条，绿色=低谷、琥珀=高峰，配一个每秒走动的指针和 `HH:MM:SS` 时间标签。

## 特性

- **一条 2px 横条**贴在界面顶部，不占布局、不挡操作（`pointer-events: none`）
- **24 小时刻度**：琥珀段是工作日的 09:00–12:00 与 14:00–18:00，其余全绿
- **节假日 / 调休**：法定节假日全天空闲，国务院安排调休上班的周末仍按空闲价（官方明确口径）
- **未知年份降级**：没有节假日数据的年份画灰色斜纹，宁可漏报高峰，也不误报高价
- **跟随侧边栏**：侧边栏收起/展开时横条自动重排，无需刷新
- **调试开关**：URL 加 `?tbdate=2026-10-02T10:00` 可用指定时刻渲染，方便核对任意日期的配色

## 安装

插件通过 DSH profile 挂载，包名是 `dsh-diy-timebar`（仓库名与包名不同，是刻意的：包名保持不变，已有的 patch 配置不用改）。

1. 把本仓库放到任意目录，例如 `<你的目录>/dsh-timebar`。

2. 在你的 DSH profile 的 `node_modules` 下建一个目录联接（Windows）或符号链接：

   ```powershell
   # Windows（管理员 PowerShell 或开启开发者模式）
   New-Item -ItemType Junction `
     -Path "$env:DSH_HOME\profiles\<profile>\node_modules\dsh-diy-timebar" `
     -Target "<你的目录>\dsh-timebar"
   ```

   ```bash
   # macOS / Linux
   ln -s "<你的目录>/dsh-timebar" "$DSH_HOME/profiles/<profile>/node_modules/dsh-diy-timebar"
   ```

3. 在 profile 的 `cordis.patch.yml` 末尾加：

   ```yaml
   - insert:
       - id: timebar
         name: 'dsh-diy-timebar'
   ```

4. 重启 DSH。顶部的横条会直接出现，没有设置项。

> 直接用 `npm install` 装到 profile 里也可以，效果等同：DSH 会按 `dsh` 字段把它作为 Web 客户端插件下发。

## 什么时候是高峰价？

| 类别 | 时段 | 颜色 |
|---|---|---|
| 高峰 | 周一至周五（不含法定节假日）09:00–12:00、14:00–18:00 | 琥珀 |
| 低谷 | 每日 00:00–09:00、12:00–14:00、18:00–24:00 | 绿 |
| 周末 | 周六、周日全天 | 绿 |
| 法定节假日 | 全天 | 绿 |
| 调休上班的周末 | 全天仍按低谷价 | 绿 |
| 未知年份 | 全天空闲 + 灰色斜纹 | 灰 |

判定口径说明：官方按请求**完成**时刻计价，本插件按**当前时刻**显示。价目与规则出处见 [DeepSeek API 文档 · 模型 & 价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)。

完整的形态参数、配色 token、节假日表逐年维护步骤见 [`docs/configuration.md`](docs/configuration.md)。

## 节假日数据的年度维护

节假日表硬编码在 `lib/client.js` 的 `HOLIDAYS_2026` 与 `MAKEUP_WORKDAYS` 中，来源是国务院办公厅的年度放假安排通知。**次年通知发布后**需要：

1. 新增 `HOLIDAYS_2027`，并入 `HOLIDAYS` 集合；
2. 把 `2027` 加进 `KNOWN_YEARS`；
3. 补充新的 `MAKEUP_WORKDAYS`（调休上班日）；
4. 跑 `node scripts/verify-rules.cjs` 再重启 DSH。

没加进 `KNOWN_YEARS` 的年份不会报错，只是整条变成灰色斜纹。

## 开发

```bash
npm test               # 抽出 @rules-begin/@rules-end 规则块，跑 1143 项断言
npm run test:tokens    # 校验源码里用到的 --dsw-alias-* token 在 DSH 安装包里真实存在
```

`test:tokens` 需要能找到 DSH 的 `app.asar`，可用 `--asar` 或环境变量 `DSH_ASAR` 指定：

```bash
node scripts/check-theme-tokens.cjs --asar "<DSH>/resources/app.asar" lib/client.js
```

宿主侧 `lib/index.js` 是一个空的 `apply()`——这个插件是纯客户端 UI，所有逻辑都在 `lib/client.js` 里，通过 `window.__ModuleLoader__` 注册。

## 已知限制

- 高峰判定不读浏览器时区，直接取本机时间的小时数——如果系统时区不是北京时间，显示会偏。请把系统时区设为 Asia/Shanghai。
- 横条的 Y 坐标（73px）是按当前 DSH 头部高度定的，界面大改版后可能需要微调 `client.js` 的 `Y` 常量。

## 许可证

[MIT](LICENSE) © 2026 XiShanXian
