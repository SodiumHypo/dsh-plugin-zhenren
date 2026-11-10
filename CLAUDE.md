# 甲骨贞人 · 长期架构规划

> 本文件是「甲骨贞人」插件项目的长期架构上下文，不是执行计划。
> 后续会话在动手前先读第 1–4 节；第 7 节记录已经做出的取舍，除非出现新事实，不要重新发明。
> 事实基线：2026-11-10，基于 `.refs/yigezi-main` 与 `.refs/deepseek-harness-master` 的当前快照。

---

## 1. 项目定位与体验目标

### 1.1 一句话定位

「甲骨贞人」是一个 dsh 插件：用户提出一个问题，DeepSeek 以贞人的身份主持一次完整的甲骨占卜——灼龟、读兆、刻辞。答案不是一段漂浮的文本，而是一件留在会话里的、可重放的物质痕迹。

### 1.2 体验链

| 阶段 | 用户看到 | 系统职责 | 模型职责 | 核心/可选 |
| --- | --- | --- | --- | --- |
| 问 | 用户的问题 | 捕获会话输入 | 理解问题，判断是否适合起卜 | 核心 |
| 命辞 | 贞人写出所问之事 | 校验命辞字形的可用性 | 以古雅、克制的文体写命辞 | 核心 |
| 灼龟 | 灼点发热、起烟、焦痕 | 生成 seed、灼点、灼龟时间 | 宣布灼龟，不提前描述兆象 | 核心 |
| 兆 | 裂纹从灼点生长 | 生成 `CrackSpec` 与唯一 `auspice` | 读兆，写占辞 | 核心 |
| 刻辞 | 字逐一出现，力度不均 | 生成 `glyphPlan`、布局、刻辞节奏 | 写完整卜辞，处理缺字 | 核心 |
| 读 | 现代释义、说文引文、出处 | 提供 `shuowen`、`correction`、署名 | 用现代语言解释，标明边界 | 核心 |
| 验 | 日后回访的结果 | 记录验辞 | 复盘，不做事后归因 | 可选/未来 |

核心链是「问 → 命辞 → 灼 → 兆 → 刻 → 读」。验辞、多材质、导出、检索都属于后续演进；它们不阻塞核心链，也不应把核心卡片变成工具箱。

### 1.3 设计原则

1. **物质优先**：每一次回答都必须留下一个可见的物件——龟甲、裂纹、刻痕、卜辞。不能退化成“一段带古风的话”。
2. **不伪造**：字形只来自 1,425 字库；释义只来自《说文》数据；没有的字返回 `found: false`，没有的释义返回 `shuowen: null`；绝不合成字形，绝不编造说文引文。
3. **单一兆象**：一次占卜只有一个权威 `auspice`。裂纹、占辞、卡片标签、现代解读都从它派生；模型不得在文字里改写兆象。
4. **会话即档案**：工具调用与结果就是持久记录；`presentationMeta` 就是动画句柄。不预设数据库，不依赖进程内状态才能重放。
5. **不阻塞**：动画是装饰层，不是事实层。host 立即返回结果，client 自己播；即使 client 崩溃、字体加载失败或用户关闭动画，对话仍然可读、可用。
6. **学术诚实**：兆纹的吉凶映射是**艺术约定**，不是殷墟卜甲的考古复原；《说文》原文逐字引用，白话是转述，古文字纠正是有出处的旁注。关于页与卡片页脚必须说清楚。
7. **克制**：不做 3D、不做抽卡、不做过度粒子、不做拟真音效。仪式感来自材质、节奏与留白，不来自特效堆叠。

### 1.4 非目标

- 不是真实的占卜服务，不宣称超自然效力，不替代用户的判断。
- 不是甲骨学数据库或完整字编；当前只覆盖 1,425 个有甲骨字形的字。
- 不是《说文》全译或汉语词源百科；白话转述是辅助阅读，不是学术定论。
- 不是通用 Canvas/动画框架；只服务这一套仪式。
- 不做数据库、不做服务端渲染、不做运行时爬取、不做遥测。
- 不以侧栏 HTML 预览、全屏遮罩或独立页面作为主载体；仪式发生在会话流里的工具卡片中。

---

## 2. 事实基线

本节记录从 `.refs` 读到的、会直接影响架构的事实。后续会话如果发现本节与代码不符，以实际代码为准，并更新本节。

### 2.1 dsh 侧

#### 2.1.1 插件形态

- 插件是一个 TypeScript 模块，导出 `apply(ctx)` 与 `name`；可选导出 `inject` 与 Schemastery `Config`。
- 插件可以是对象、类或函数形式；注册的 effect 会自动清理。
- 一个 npm 包可以同时提供 host 半包（`main`）与 client 半包（`exports["./client"]` + `dsh.client`）。
- bundle 通过 `dsh.bundle.patch` 指向 `cordis.patch.yml`；profile 列出 bundles，用 `dsh --profile <name>` 启动。

#### 2.1.2 工具注册

- 通过 `ctx.tools.register(defineTool({...}))` 注册。
- 关键字段：`name`、`description`、`parameters`、`output.schema`、`output.render`、`output.presentationMeta?`、`execute`、`presentCall?`、`presentResult?`。
- `output.presentationMeta(args, value)` 是纯函数投影：只依赖参数与结果，必须可 JSON 序列化，会被持久化并随结果重放。
- 模型看到的是 `value`；client 看到的是 `presentationMeta`。两者可以不同：模型看语义结果，client 看视觉规格。
- `presentCall` / `presentResult` 只支持固定卡片词汇（generic/terminal/diff/search/read/web），**不能表达 Canvas 仪式**。

#### 2.1.3 内联自定义 UI

- 唯一合适的载体是 keyed slot `tool.call.toolview`，定义在 `@deepseek-ai/dsh-client-ui-tool`。
- 注册方式：

  ```text
  ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register({ name: 'tool.call.toolview', key: '<wire tool name>', locale: NS }, Component))
  ```

- `key` 必须与 wire tool name 完全一致；拼错不会渲染，会落到 generic row。
- 同一 key 被重复注册会替换旧视图；视图的 effect 生命周期跟随注册 fiber。
- `ToolCallViewProps` 的阶段：
  - `phase: 'preparing'` → `block: PreparingToolCall`，参数可能不完整；
  - `phase: 'start'` → `block: StartedToolCall`，有完整 `argsRaw` 与惰性 `args`；
  - `phase: 'result'` → `block: ToolResultNode`，`meta?: unknown` 就是持久化的 `presentationMeta`。
- 公共 props 还包括 `callId`、`toolName`、`cwd`、`home`、`openFile`、`loadImage`、`inspect`。
- 视图不应依赖未文档化的 `block` 内部结构；结果阶段只读 `block.meta`，开始阶段最多读 `argsRaw`/`args` 做初始文案。

#### 2.1.4 客户端打包

- `package.json` 里声明 `exports["./client"]` 与 `dsh.client`；`dsh.client.platform` 固定为 `'web'`。
- client 半包由 tsdown 构建为 `lib/client.js`，采用 lazy-CJS factory 格式。
- `ctx.clientModules` 扫描 Loader 条目，组合 `window.__DSH_BOOT__`，通过 `/plugins` 提供 bundle 与注入行。
- 纯 UI 插件可以有空的 host `apply`；`ui-skill` 是先例。
- 字体等静态资源可以随包发布；dsh 仓库里 `ui-theme` 有 tsdown 复制 `.woff2` 的先例。

#### 2.1.5 系统提示词

- `ctx.systemPrompt.section({ name, order, text })` 注入有序提示词段。
- `ctx.systemPrompt.getSectionOrder(...)` 可解析仓库内的相对位置。
- 贞人人格、工具使用协议、禁止伪造的约束放在这里最合适；工具参数说明放在工具 `description` 里。

#### 2.1.6 没有现成的 Canvas 范式

- dsh 里能找到的动画先例是 CSS 动画（如 `AnimatedRows`），没有 Canvas 插件范式。
- yigezi 自己的 Canvas 渲染器（1080×1080、`@font-face`、GIF89a 编码器、paper/rubbing/classic 主题）是最近的可复用先例。
- HTML preview / deliverables 是侧栏沙箱 iframe，面向文档预览，不是内联会话卡片。

### 2.2 yigezi 侧

#### 2.2.1 数据结构

`.refs/yigezi-main/index.html` 是自包含页面，核心数据以 JS 字面量内联：

| 常量 | 规模 | 含义 |
| --- | --- | --- |
| `SW` | 9,815 条 | 《说文》字头表 |
| `TS` | 2,151 条 | 简体→繁体/异体映射，值可能是多字 |
| `XZ` | 10 条 | 古文字纠正 |
| `HAS_ORAC` | 1,425 个唯一字 | 有甲骨字形的字 |
| `HAS_SEAL` | 10,249 个唯一字 | 有篆书字形的字 |
| `BELONG` | 6,940 条 | 字→声符系字头 |
| `XS` | 740 条 | 声符系字头→成员 |

`SW` 单条结构：

```json
{
  "e": "惟初太始，道立於一，造分天地，化成萬物。凡一之屬皆从一。",
  "p": "yī",
  "r": "一",
  "v": "01",
  "f": "於悉切",
  "w": "弌",
  "mc": "'jit",
  "pos": "臻開三入眞影",
  "oc": "*ʔit",
  "ocsrc": "bzd"
}
```

- `e`：说文原文；`p`：拼音；`r`：部首；`v`：卷次；`f`：反切；`w`：重文/异体。
- `mc`/`pos`/`oc`/`ocsrc`：中古音、音韵地位、上古音、来源。**当前数据层排除这些字段**，见 3.9。

`XZ` 单条结构：

```json
{
  "为": {
    "t": "甲骨文从「又」（手）从「象」，会以手牵象劳作之意（罗振玉说）。《说文》训「母猴也」，是未见甲骨文而致误。"
  }
}
```

`XZ` 只有 10 条：为、射、行、出、各、止、得、家、昔、明。它是稀疏旁注，不是全量“古文字纠正”字段。

#### 2.2.2 字形字体

- `orac.woff2`：397,236 字节；cmap 共 1,426 条，其中 1,425 条为真实字形码位，另 1 条是 U+FFFF 非字符（构建期不变量显式排除它）；1,315 个唯一字形；102 个字形被 110 个额外码位共享；unitsPerEm 2048；字形名 `uniXXXX`；所有字形非空。
- 字体按 Unicode 码位映射，不按语义映射；共享字形意味着不同字可能画出同一形状。显示端没有问题，但导出/去重时不能假设“一字形一码位”。
- `seal.woff2`：8,711,700 字节；10,249 个 cmap 条目；9,533 个唯一字形；不属于当前范围。
- 字体名是 `Oracular`；yigezi 用 `@font-face` 直接加载。当前规划不修改、不重命名字体，见 3.9。

#### 2.2.3 字头解析

yigezi 的 `lookup(raw)` 大致行为：

1. 取输入中第一个 CJK 字；
2. 用 `TS` 找到繁体候选，优先选 `SW` 有记录或 `HAS_ORAC` 包含的候选；
3. 返回 `{ s, t, sameT, sw, sealChar, oracChar }`。

它的局限：

- 没有 OpenCC；
- 没有反向 `w`（重文）索引；
- `sw` 可能为 `null`，即使 `oracChar` 存在；
- 不处理现代繁体字与说文形体之间的差异。

所以它是参考实现，不是我们的查询层。

#### 2.2.4 字头覆盖的实际计数

按“每个甲骨字能否解析到《说文》字头”的口径统计：

| 解析方式 | 数量 | 说明 |
| --- | --- | --- |
| 直接命中 `SW` | 1,133 | 甲骨字本身就是说文头 |
| 经 `TS`/OpenCC 命中 | 23 | 简体/异体→繁体→说文头；OpenCC 层未单独拆分 |
| 经反向 `w` 命中 | 40 | 重文关系反查 |
| **可自动解析** | **1,196** | 1,133 + 23 + 40 |
| **自动未匹配** | **229** | 有甲骨字形，但自动找不到说文头 |

补充事实：

- `HAS_ORAC` 与 `SW` 的直接交集是 1,133；甲骨-only 是 292。
- 292 个甲骨-only 字里，63 个能通过变体关系接上《说文》，剩下 229 个就是上表的未匹配。
- 分项取决于优先级顺序；OpenCC 层未单独拆分，但总数 1,196 与未匹配 229 不受影响。
- 随包数据在这 229 个之上再叠加人工裁定：6 条有出处的 `kind: "headword"` 条目（亡、以、年、春、宜、于）把实际未匹配降到 223。抽取报告的 `resolvedBy` 分解为 `exact-sw 1133 / reverse-w 40 / opencc 16 / ts 7 / manual-headword 6 / none 223`。
- 229 个不是“《说文》没有这个词”，而是“别名层没找到字头”。下面的箭头表示“查询字 → 说文头”，不是“查询字 → 字形”；甲骨字形仍是查询字本身（例如 `亡` 的字形仍是 `亡`，只是说文头是 `亾`）。
  - 亡 → 亾
  - 以 → 㠯
  - 年 → 秊
  - 春 → 萅
  - 宜 → 宐
  - 于 → 亏
  - 明 → 朙（反向 `w` 已覆盖）
  - 上 → 丄（反向 `w` 已覆盖）
  - 下 → 丅（反向 `w` 已覆盖）
  - 射 → 䠶（反向 `w` 已覆盖）
  - 为 → 爲（`TS` 已覆盖）
  - 万 → 萬（`TS` 已覆盖）
- 此前“1,173 / 252”的估算是把变体目标算进了甲骨字集合；按查询解析口径应以 **1,196 / 229** 为准。
- `SW` 里有 `w` 字段的条目是 1,061 条，是反向重文索引的来源。

#### 2.2.5 授权

| 资产 | 许可 | 备注 |
| --- | --- | --- |
| Oracular 字体 | OFL-1.1 | 字体名可能涉及 Reserved Font Name；当前不修改、不子集化 |
| shuowen.org 文本 | Apache-2.0 | `SW` 的 `e`、`p`、`r`、`v`、`f` 等 |
| yigezi 代码/整理 | MIT | 数据抽取与 `XZ` 旁注 |
| OpenCC | Apache-2.0 | 构建期使用；若分发 s2t 表需带声明 |
| PHONO-ML | CC BY 4.0 | `mc`/`pos`/`oc` 等音韵字段，当前排除 |
| 广韵形声考 | 无明确开源许可 | 当前排除 |

### 2.3 事实对架构的强制约束

1. **主键不能只是现代繁体字**：说文头是朙、亾、㠯、秊、宐、亏这类形体；必须有“说文头 + 别名层 + 甲骨字形码位”三件套。
2. **1,425 是字形边界，不是释义边界**：所有 1,425 字都有字形；只有 1,196 字能自动接上《说文》，加人工裁定后随包数据为 1,202。`found` 与 `shuowen` 必须分开表达。
3. **字体可以直接用**：Canvas 的 `fillText` 加载 `orac.woff2` 即可，不需要在构建期抽取 1,425 条 SVG path；这避免重复字形数据，也避免修改字体。
4. **内联卡片只能走 `tool.call.toolview`**：`presentCall`/`presentResult` 的固定词汇无法承载仪式；HTML preview 在侧栏，不是会话流。
5. **host 不应依赖未确认的会话存储 API**：当前没有文档化的数据库；会话日志与 `presentationMeta` 已足够做持久化与重放。

---

## 3. 数据层

### 3.1 路线锁定

数据层锁定“方案一”：

- 从 yigezi 的内联数据**离线抽取**；
- 生成静态 JSON，随包发布；
- 运行时只读 JSON，构建内存索引；
- 不引入 yigezi 作为运行时依赖；
- 不预设数据库；
- 不在运行时抓取网页；
- 不引入 yigezi 与 dsh 之外的重型运行时依赖。

抽取脚本是开发工具，不属于运行时。它读取 `.refs/yigezi-main/index.html` 与字体文件，产出 `data/` 下的静态资产。`.refs` 是参考快照，不是运行时依赖；生成物才是契约。

### 3.2 抽取管线

抽取管线按以下顺序执行。它是**构建期**流程，不是插件运行时流程。

1. **读取源数据**：解析 `SW`、`TS`、`XZ`、`HAS_ORAC`；去重 `HAS_ORAC`，得到 1,425 个唯一字。
2. **建立反向重文索引**：遍历 `SW` 的 `w` 字段，建立 `重文 → 字头` 映射；一个重文可能对应多个字头，保留全部候选并记录冲突。
3. **构建 OpenCC s2t 表**：用 OpenCC 对 1,425 个甲骨字、`SW` 字头、`TS` 键做简体→繁体转换，固化为 `s2t` 映射。只在构建期调用 OpenCC，运行时不依赖它。
4. **逐字解析字头**：对每个甲骨字 `c`，按以下优先级找 `headword`：
   1. 人工别名表 `alias-overrides.json` 中 `kind: "headword"` 且 `from = c` 的条目；
   2. `SW[c]` 直接命中；
   3. 反向 `w` 索引命中；
   4. OpenCC s2t 结果命中 `SW`；
   5. yigezi `TS[c]` 的候选逐个命中 `SW`；
   6. 都没有 → `headword = null`，记作 glyph-only。
5. **附加古文字纠正**：用 `XZ` 的键（为、射、行、出、各、止、得、家、昔、明）去匹配记录。匹配顺序：甲骨字本身 → 字头 → 别名集合。命中则写入对应 `headword` 记录的 `shuowen.correction`，来源标为 `yigezi:XZ`。
6. **生成字形记录**：每个 `glyphChar` 一条，写入 `headword`（可为 `null`）与 `resolvedBy`。`glyphChar` 必须是 1,425 字之一。
7. **生成字头记录**：每个唯一 `headword` 一条，写入 `shuowen`、`pinyin`、`radical`、反向 `glyphChars`。1,202 个可释义字形（1,196 自动 + 6 人工）归并为 1,181 个 `headword`。
8. **生成别名索引**：把没有独立字形的输入形式映射到 `glyphChar`：
   - `SW` 字头本身（当它不是 1,425 字形之一时，如 `亾`、`䠶`）；
   - `TS` 中指向该字形的简体/异体；
   - OpenCC s2t 的简体形式；
   - 反向 `w` 的重文；
   - 人工别名（`kind: "alias"`）。
   - 键必须与 1,425 字形集合不相交；输入本身有字形时，运行期直接命中，不进别名表。
9. **写文件**：`oracle.json`、`manifest.json`、`extraction-report.json`；如果人工别名表不存在，创建一个空表，不覆盖已有内容。
10. **构建期不变量检查**：
    - `glyphs` 恰好 1,425 条，键集合与字体 cmap 集合一致；
    - `headwords` 恰为 `glyphs` 中非空 `headword` 的去重集合；每个 `headword` 至少被一个字形引用；
    - 每个 `glyphs[*].headword` 要么为 `null`，要么存在于 `headwords`；
    - 每条 `headwords[*].shuowen.original` 非空；
    - `aliases` 的键不与 1,425 字形集合重叠，值必须是存在的 `glyphChar`；
    - 被排除的音韵字段没有进入生成物。
10. **复制字体**：原样复制 `orac.woff2`，同时复制 OFL 文本；不修改字体二进制。

### 3.3 主键与两层记录

数据层不是一个扁平记录数组，而是两张表加一张索引：

- `headwords`：以 `headword` 为主键，1,181 条；每条承载一份《说文》释义。
- `glyphs`：以 `glyphChar` 为主键，1,425 条；每条指向一个 `headword`，或为 `null`。
- `aliases`：输入形式 → `glyphChar` 的索引；构建期生成，键不与 1,425 字形集合重叠。

为什么必须分两层：

1. **说文头不唯一对应字形**：1,202 个可释义字形只对应 1,181 个说文头。21 个说文头被两个甲骨字形共享，例如 `朙`（明、朙）、`萬`（万、萬）、`丄`（丄、上）、`丅`（丅、下）、`聲`（声、聲）、`復`（复、復）、`棄`（弃、棄）。若一条记录以 `headword` 为主键又携带单个 `glyphChar`，主键唯一性被破坏。
2. **字形不都有说文头**：229 个字形为 glyph-only。若字形不是独立主键，这些字无处落表。
3. **释义属于字头，不属于字形**：共享字头的两个字形必须读同一份释义，不能复制两份；否则修订一处会漏掉另一处。

**为什么主键不是现代繁体字**：这里的 `headword` 是**说文形体**。

- 明的说文头是 `朙`；
- 亡的说文头是 `亾`；
- 以的说文头是 `㠯`；
- 年的说文头是 `秊`；
- 宜的说文头是 `宐`；
- 于的说文头是 `亏`。

所以“繁体字头为主键，简体经 OpenCC 转换后查询”要落成：

> **说文头是释义主键；字形是字形的独立主键；现代繁体、简体、异体、重文通过字形表与别名层落到具体 `glyphChar`。**

`glyphChar` 始终是 1,425 字之一，用来索引 `orac.woff2`。它可能与所属 `headword` 不同：`明` 的字形记录指向 `headword = 朙`，但绘制时用 `glyphChar = 明`。

构建期与运行期的优先级是两套，不可混用：

```text
构建期：为每个 glyphChar 选 headword
manual-headword > exact SW > reverse w > OpenCC > TS > none

运行期：为每个输入选 glyphChar
exact glyph > alias > not found
```

**运行期必须先精确匹配字形**，而不是先查说文头。原因：`明` 与 `朙` 都各自有甲骨字形，也都指向同一个说文头 `朙`。用户输入 `明` 时，刻出来的必须是 `明`，不能被“归一化”成 `朙`；输入 `朙` 时同理。只有当输入本身没有字形时，才走别名表。

`aliases` 的表键必须与字形集合不相交。这条不变量同时解决了共享说文头的歧义：需要走别名的输入本来就没有自己的字形，别名表在构建期已经为它选定一个确定的 `glyphChar`——优先选 `glyphChar === headword` 的字形，否则按码位取最小者——因此运行期不需要再裁决“一个字头对应两个字形时该刻哪个”。

人工覆盖：

- `alias-overrides.json` 的 `kind: "headword"` 条目给某个字形指定说文头（`from` 是 1,425 字形之一，`to` 是 `SW` 字头）；
- `kind: "alias"` 条目把无字形的输入映射到字形（`from` 不在 1,425 集合，`to` 是字形）；
- 每条都要写明 `source` 与 `note`；没有出处的“看起来像”不允许写入。

冲突处理：

- 自动层冲突（例如同一个别名指向两个字形）不自动裁决，写入 `extraction-report.json`，该别名暂不进入索引；
- 人工表可以显式裁决冲突，并在报告中留下记录；
- 共享字体字形（两个字画同一形状）不视为冲突；字体本身允许共享。

### 3.4 数据契约

`oracle.json` 的顶层结构：

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-11-10",
  "source": {
    "yigezi": "snapshot path and hash",
    "shuowen": "shuowen.org via yigezi",
    "font": "Oracular"
  },
  "counts": {
    "glyphs": 1425,
    "glossedGlyphs": 1202,
    "glyphOnly": 223,
    "headwords": 1181,
    "sharedHeadwords": 21,
    "aliases": 627
  },
  "headwords": {},
  "glyphs": {},
  "aliases": {}
}
```

`counts` 是随包数据的实际计数。它与 2.2.4 的“自动解析”口径差 6 个字：`alias-overrides.json` 里带出处的 6 条 `kind: "headword"` 人工裁定（亡→亾、以→㠯、年→秊、春→萅、宜→宐、于→亏）把自动未匹配从 229 降到 223，释义字形从 1,196 升到 1,202，字头从 1,176 升到 1,181，共享字头从 20 升到 21。自动层的数字仍是审计基线，见 2.2.4 与 9A。

`headwords` 的键就是 `headword`；条目：

```json
{
  "朙": {
    "shuowen": {
      "original": "照也。从月从囧。凡朙之屬皆从朙。",
      "vernacular": "明亮、照耀。",
      "vernacularStatus": "draft",
      "correction": null
    },
    "pinyin": "míng",
    "radical": "朙",
    "glyphChars": ["明", "朙"],
    "sources": {
      "shuowen": "shuowen.org via yigezi"
    }
  }
}
```

`glyphs` 的键就是 `glyphChar`；三个典型条目：

```json
{
  "明": { "headword": "朙", "resolvedBy": "reverse-w" },
  "朙": { "headword": "朙", "resolvedBy": "exact-sw" },
  "其": { "headword": null, "resolvedBy": "none" }
}
```

带古文字纠正的字头：

```json
{
  "爲": {
    "shuowen": {
      "original": "母猴也。其爲禽好爪。爪，母猴象也。下腹爲母猴形。",
      "vernacular": "《说文》释为母猴；甲骨文从手牵象，或为“为”的本义。",
      "vernacularStatus": "draft",
      "correction": {
        "text": "甲骨文从「又」（手）从「象」，会以手牵象劳作之意（罗振玉说）。《说文》训「母猴也」，是未见甲骨文而致误。",
        "source": "yigezi:XZ"
      }
    },
    "pinyin": "wéi",
    "radical": "爪",
    "glyphChars": ["爲"],
    "sources": {
      "shuowen": "shuowen.org via yigezi"
    }
  }
}
```

`aliases` 的键是无字形输入，值是 `glyphChar`：

```json
{
  "贞": "貞",
  "为": "爲",
  "亾": "亡",
  "䠶": "射"
}
```

`其` 有甲骨字形，但自动层接不上一个可直接互换的说文头；它与 `箕` 有语源关系，但不是重文，不能自动映射。`其` 的字形记录保持 `headword: null`，直到有人给出可核对的出处。

字段约定：

- `glyphChar`：`glyphs` 的键；1,425 字之一；Canvas 用它来 `fillText`。
- `headword`：`headwords` 的键；说文头。字形记录里可为 `null`。
- `headwords[*].glyphChars`：反向引用，只读派生；列出一个说文头对应的全部甲骨字形。
- `glyphs[*].resolvedBy`：构建期解析路径，取 `manual-headword` / `exact-sw` / `reverse-w` / `opencc` / `ts` / `none`；审计用。
- `aliases`：只用于把无字形输入归一到字形，不用于展示。
- `shuowen.original`：逐字保留的《说文》原文；不删“凡……之屬皆从……”公式。
- `shuowen.vernacular`：一句白话转述；是我们生成的辅助文本，不是 shuowen.org 原文；用 `vernacularStatus` 标记状态。
- `shuowen.correction`：可选；来自 yigezi `XZ`，保留出处；没有就是 `null`。
- `pinyin`/`radical`：来自 `SW` 的 `p`/`r`；可选展示，不参与吉凶判断。
- `sources`：审计用；记录释义来源。

**不进入记录的音韵字段**：`mc`、`pos`、`oc`、`ocsrc`。原因见 3.9。

### 3.5 查询契约与 `found` 语义

查询层的返回类型：

```ts
type OracleLookup =
  | {
      found: false
      query: string
      normalized: string
      reason: 'not-in-oracle-corpus'
      supportedCount: 1425
    }
  | {
      found: true
      query: string
      normalized: string
      glyphChar: string
      headword: string | null
      shuowen: ShuowenGloss | null
      matchedBy: 'glyph' | 'alias'
      sources: SourceRef[]
    }

interface ShuowenGloss {
  original: string
  vernacular: string
  vernacularStatus: 'draft' | 'reviewed'
  correction: { text: string; source: string } | null
}
```

查询顺序是固定三步：

1. 输入归一化后若本身就是 1,425 字形之一 → 直接命中，`matchedBy: "glyph"`；
2. 否则查 `aliases` → 命中则 `matchedBy: "alias"`；
3. 都没有 → `found: false`。

语义必须严格区分：

- **`found` 表示“有甲骨字形”**，不是“有《说文》释义”。
- `found: true` + `headword: null` + `shuowen: null` 是合法结果，代表“这个字有甲骨字形，但构建期没接上《说文》”。当前有 229 个这样的字。
- `found: false` 表示归一化后的输入不在 1,425 字库内。此时：
  - 不返回最近的字；
  - 不返回拼音相似的字；
  - 不生成字形；
  - 不猜释义；
  - 只返回 `reason` 与 `supportedCount`，让模型改写或让用户换字。
- 输入归一化：NFC、去空白、取单个 CJK 字；如果一个字符串包含多个字，由上层拆字后逐字查询，查询层本身只接受单字。
- `normalized` 是查询最终落到的 `glyphChar`；`query` 是原始输入。模型和 UI 都要能看到两者的差异，避免“查的是简体、刻的是繁体”造成误解。`found: false` 时 `normalized` 只是清洗后的输入，不暗示存在近似字。
- `found` 的判断发生在归一化之后：`贞` 本身不在 1,425 字库，但经 OpenCC/TS 归一为 `貞` 后命中，因此结果是 `found: true`，`glyphChar = 貞`。不能因为原字面不在字库就直接判 `found: false`。

**为什么不是 `found` 同时要求有释义**：如果要求两者都有，229 个有甲骨字形的常见字（亡、以、年、春、其、于等）会被判为“未找到”，用户就无法刻出这些字。这既不符合字形事实，也会让卜辞变得残缺。正确做法是分开表达：字形在，刻；释义缺，诚实地说“《说文》未收此形”。

### 3.6 1,425 边界的传播

1,425 不是数据层的一个统计数字，而是贯穿所有层的硬边界。每一层都必须显式处理它。

| 层 | 边界表现 | 处理方式 |
| --- | --- | --- |
| 数据层 | 只有 1,425 个 `glyphChar` | 不生成合成字形；glyph-only 字形记录 `headword: null, shuowen: null` |
| `zhenren_burn` | 命辞可能含未收字 | 返回 `chargeGlyphs` 与 `missing`；不阻断灼龟 |
| `zhenren_inscribe` | 卜辞可能含未收字 | `glyphPlan` 标记 `found`/`placeholder`；保留槽位；`ok: true` 仍可成立 |
| 动画层 | 字体只有 1,425 个码位 | 只画字体字形；缺字画空刻占位；不画“想象中的甲骨文” |
| 文本层 | 模型可能想写未收字 | 提示词禁止编造；改写为可用字，或接受占位并在现代释义里说明 |
| UI 层 | 用户可能问“为什么缺字” | 页脚注明“字形库 1,425 字；未收字以空刻表示” |
| 导出层 | 导出图片可能被脱离上下文 | 导出物带同样的边界说明与出处；不做事后补字 |

关键规则：

> **未收字返回 `found: false`，不编造字形。1,425 字是客观上限。缺字在卜辞里表现为“空刻”，不是错误，也不是可以绕过的限制。**

### 3.7 静态数据文件

```text
packages/zhenren/data/
├── oracle.json              # 1,425 字形 + 1,181 字头；host 运行时读取
├── alias-overrides.json     # 人工字头/别名裁决；构建期合并
├── manifest.json            # 计数、源哈希、许可、schemaVersion
├── extraction-report.json   # 解析报告、冲突、未匹配清单；审计用
└── fonts/
    ├── orac.woff2           # 原样字体
    └── OFL.txt              # OFL-1.1 文本
```

约束：

- `oracle.json` 只含 1,425 条字形记录与 1,181 条字头记录，不含完整 9,815 条 `SW`。完整 `SW` 只在构建期读取。
- `alias-overrides.json` 是人工维护文件；重新抽取不得覆盖它。每条必须带 `kind`：

  ```json
  {
    "kind": "headword",
    "from": "亡",
    "to": "亾",
    "source": "说文重文/字形对应，需人工核对",
    "note": "亡的说文头为亾"
  }
  ```

  `kind: "headword"` 的 `from` 是 1,425 字形之一，`to` 是 `SW` 字头；`kind: "alias"` 的 `from` 是无字形输入，`to` 是字形。两种都只允许经过核对的具体字对。

- `manifest.json` 是审计锚点：记录源文件哈希、yigezi 快照、OpenCC 版本、生成时间、计数、许可名称。运行时可选校验 `schemaVersion`。
- `extraction-report.json` 不是运行时资产；它记录每个字的解析路径、229 个未匹配字、别名冲突。后续人工补别名时先看这份报告。
- 字体与 OFL 文本必须一起发布；不能只发 `orac.woff2` 而不带许可。

### 3.8 运行时索引

host 启动时：

1. 读取 `oracle.json`；
2. 校验 `schemaVersion`；
3. 建立三个不可变 Map：
   - `Map<headword, HeadwordRecord>`
   - `Map<glyphChar, GlyphRecord>`
   - `Map<alias, glyphChar>`
4. 校验查询不变量：每个 `GlyphRecord.headword` 要么为 `null`，要么存在于字头 Map；别名 Map 的键不与字形 Map 重叠；
5. 冻结索引；后续查询只读。

规模只有 1,425 条字形与 1,181 条字头，内存可忽略；不需要数据库、不需要懒加载、不需要文件监听。插件重载时重建索引即可。

失败策略：

- 文件缺失、JSON 损坏、`schemaVersion` 未知 → 工具返回结构化错误 `data-unavailable`；
- 不退回“猜字”或“跳过校验”；
- client 收到错误时渲染 generic 错误卡片，对话继续。

### 3.9 授权与署名

当前数据层的许可边界：

- **Oracular 字体**：OFL-1.1。原样使用，不修改、不重命名、不子集化。若未来必须子集化，先按 OFL 的 Reserved Font Name 规则处理，并重新评估署名。
- **shuowen.org 文本**：Apache-2.0。`shuowen.original` 是逐字引用；`vernacular` 是我们的现代转述，必须与原文区分；`correction` 来自 yigezi `XZ`，单独署名。
- **yigezi**：MIT。数据抽取与 `XZ` 旁注需要署名。
- **OpenCC**：Apache-2.0。只在构建期使用；如果分发了由它生成的 s2t 表，带 OpenCC 声明。
- **PHONO-ML / 广韵形声考**：不进入生成物。`mc`、`pos`、`oc`、`ocsrc` 全部排除。这样当前许可面收敛为 OFL-1.1 + Apache-2.0 + MIT（+ 构建期 OpenCC 的 Apache-2.0）。

署名落点：

1. 仓库根目录 `THIRD_PARTY_NOTICES.md`：完整许可文本与来源说明。
2. npm 包内 `NOTICE` / `LICENSE` / `OFL.txt`：随包发布。
3. 数据文件 `manifest.json` 的 `attribution` 字段：机器可读。
4. client 的“关于”卡片或卡片页脚：用户可见的一句话署名。
5. 如果未来有 HTTP 端点直接提供字体或数据，再加响应头；当前工具结果是 JSON，不强行造响应头。

“关于”卡片的文案基线：

> 字形：Oracular（OFL-1.1）。《说文》文本：shuowen.org（Apache-2.0）。数据整理：yigezi（MIT）。兆纹为艺术化表现，非考古复原。

这段文案是产品可见字符串，放在 locale 字典里，不要在组件里硬编码。

### 3.10 数据演进

- 抽取可重复：同一份源数据 + 同一份人工别名表 → 同一份 `oracle.json`；构建产物带哈希。
- 源快照固定：更新 yigezi 时先更新 `manifest.json` 的源哈希，再重跑抽取；不要静默替换。
- schema 版本化：破坏性字段变更时 bump `schemaVersion`；client 遇到未知版本走静态兜底。
- 229 个未匹配字是**内容债**，不是架构债：可以逐步补人工别名，每条必须有出处；不按拼音、不按语义相似度自动补。
- 白话转述是生成内容：先标 `draft`；有人审校后再标 `reviewed`。未审校的转述在 UI 上标“现代转述”，不要冒充 shuowen.org 原文。

---

## 4. 插件架构

### 4.1 包形态

一个 npm 包，host + client 两半：

- `name`：`dsh-plugin-zhenren`（示意名，最终以仓库发布名为准）。
- host：`src/index.ts` 导出 `apply(ctx)`、`name`，可选 `inject`、`Config`；注册工具与系统提示词段。
- client：`src/client/index.ts` 导出 `apply(ctx)`、`inject`；注册 `tool.call.toolview` 视图与 locale。
- 构建：沿用 dsh 的 tsdown client bundle 约定，产出 `lib/index.js` 与 `lib/client.js`；字体作为静态资源随包发布。
- host 不 import client 代码；client 不 import host 的数据层。两半只共享**契约类型**与工具名常量。

示意 manifest 片段（字段名以 dsh 当前版本为准）：

```json
{
  "name": "dsh-plugin-zhenren",
  "main": "lib/index.js",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" }
  },
  "dsh": {
    "bundle": { "patch": "cordis.patch.yml" },
    "client": { "platform": "web", "inject": ["..."] }
  },
  "files": ["lib", "data", "cordis.patch.yml", "THIRD_PARTY_NOTICES.md", "OFL.txt"]
}
```

`dsh.client.inject` 只列实际读取的服务（至少包括 tool view 所需的 slot 服务与 locale）；不要把所有 dsh 包都塞进去。

### 4.2 目录树

下面是建议结构，不是强制契约；真正的契约是 3.4、3.5、4.4、4.5 里的数据与接口。

```text
dsh-plugins/
├── CLAUDE.md
├── THIRD_PARTY_NOTICES.md
├── package.json                     # 如使用 workspace
└── packages/
    └── zhenren/
        ├── package.json
        ├── cordis.patch.yml
        ├── tsdown.config.ts
        ├── README.md
        ├── data/
        │   ├── oracle.json
        │   ├── alias-overrides.json
        │   ├── manifest.json
        │   ├── extraction-report.json
        │   └── fonts/
        │       ├── orac.woff2
        │       └── OFL.txt
        ├── scripts/
        │   └── extract-yigezi/
        │       ├── index.ts
        │       └── ...
        └── src/
            ├── index.ts               # host entry
            ├── config.ts              # Schemastery Config
            ├── prompt.ts              # 贞人协议
            ├── data/
            │   ├── schema.ts
            │   ├── load.ts
            │   └── lookup.ts
            ├── ritual/
            │   ├── seed.ts
            │   ├── crack.ts
            │   ├── ganzhi.ts
            │   ├── glyph-plan.ts
            │   └── layout.ts
            ├── tools/
            │   ├── burn.ts
            │   ├── inscribe.ts
            │   └── verify.ts          # 未来
            └── client/
                ├── index.ts
                ├── locale.ts
                ├── contract.ts        # tool 名、meta 版本、校验
                ├── views/
                │   ├── BurnRow.tsx
                │   ├── InscribeRow.tsx
                │   └── RitualCanvas.tsx
                ├── render/
                │   ├── shell.ts
                │   ├── cracks.ts
                │   ├── carve.ts
                │   └── timeline.ts
                └── assets/
                    └── orac.woff2
```

### 4.3 工具链总览

| 阶段 | 载体 | 职责 | 产物 |
| --- | --- | --- | --- |
| prepare | host 内部纯函数 | 归一化、解析字形、校验命辞、生成 seed/灼点 | `PreparedDivination`（进程内，不持久化） |
| burn | `zhenren_burn` 工具 | 生成兆纹规格、唯一吉凶、命辞字形表 | `BurnResult` + `presentationMeta` |
| inscribe | `zhenren_inscribe` 工具 | 逐字校验、缺字占位、布局、刻辞节奏 | `InscribeResult` + `presentationMeta` |
| present | client 视图 + 助手正文 | 播放动画、展示卜辞、释义、署名 | 可见卡片 + 会话文本 |
| verify | `zhenren_verify`（未来） | 记录验辞，关联原卜 | `VerifyResult` + `presentationMeta` |

拆分理由：

- `prepare` 不单独暴露成工具，避免多一步可见调用；它的逻辑被 burn 与 inscribe 复用。
- `burn` 与 `inscribe` 分开，是为了让“兆象”先于“占辞”。模型先拿到 `auspice`，再写占辞，文字跟随兆象，而不是先写好答案再补裂纹。
- `present` 不是工具，而是卡片与助手文本的组合；不需要为“展示”再发一次工具调用。
- `verify` 只预留契约，不在当前范围实现；它不能改变已经发生的兆象，只能追加记录。

### 4.4 `zhenren_burn`

#### 输入

```json
{
  "question": "近期是否适合出行？",
  "charge": "贞：今其出，亡咎？",
  "tone": "中性",
  "seed": "optional-replay-seed"
}
```

字段：

- `question`：用户问题的原意或摘要；用于 seed 与卡片标题。
- `charge`：命辞；模型写。长度建议 ≤ 24 字；超过工具上限时返回 `invalid` 并给出上限，不截断。
- `tone`：可选，`吉` / `凶` / `中性`；是“导演提示”，影响吉凶分布，不保证结果。
- `seed`：可选；固定 seed 用于重放与调试；不传则生成随机 seed。

#### 输出（模型可见）

```json
{
  "divinationId": "div_01J...",
  "seed": "8f3c...",
  "question": "近期是否适合出行？",
  "charge": "贞：今其出，亡咎？",
  "dayGanzhi": "戊子",
  "prefix": "戊子卜，鱼贞：",
  "auspice": "中性",
  "reading": {
    "mainDirection": "level",
    "branchPattern": "symmetric",
    "intensity": 0.5
  },
  "burnPoint": { "x": 0.48, "y": 0.38 },
  "chargeGlyphs": [
    { "char": "贞", "found": true, "headword": "貞", "glyphChar": "貞", "glossFound": true },
    { "char": "其", "found": true, "headword": null, "glyphChar": "其", "glossFound": false }
  ],
  "missing": [],
  "attribution": "字形：Oracular（OFL-1.1）；《说文》：shuowen.org（Apache-2.0）。"
}
```

说明：

- `auspice` 是唯一权威值；模型后面的占辞必须与它一致。
- `dayGanzhi` 是本机当日干支；`prefix` 是 host 按 `<干支>卜，<贞人名>贞：` 固定生成的前辞（贞人名来自配置，默认「鱼」）。模型没有可靠的本地日期，所以前辞不能交给模型生成；模型只把它原样带到刻辞，不得改写。
- `reading` 是兆象的语义摘要，供模型措辞；不是第二套吉凶。
- `chargeGlyphs` 让模型知道命辞里哪些字没有字形；如果有 `missing`，模型可以在写占辞/卜辞时改写，或接受空刻。
- `burnPoint` 是归一化坐标；client 用它做灼点与裂纹起点。

#### `presentationMeta`（client 可见）

```json
{
  "version": 1,
  "kind": "zhenren.burn",
  "divinationId": "div_01J...",
  "seed": "8f3c...",
  "question": "近期是否适合出行？",
  "charge": "贞：今其出，亡咎？",
  "auspice": "中性",
  "burnPoint": { "x": 0.48, "y": 0.38 },
  "shellSeed": "shell-8f3c",
  "cracks": {
    "version": 1,
    "main": {
      "points": [[0.48, 0.38], [0.47, 0.44], [0.49, 0.51]],
      "width": 2.2,
      "breaks": []
    },
    "branches": [
      {
        "order": 1,
        "startT": 0.35,
        "points": [[0.48, 0.47], [0.56, 0.46], [0.63, 0.48]],
        "width": 1.4
      }
    ],
    "glow": { "radius": 0.08, "temperature": 0.6, "fadeMs": 600 },
    "bounds": { "x": 0.08, "y": 0.08, "w": 0.84, "h": 0.84 }
  },
  "attribution": "字形：Oracular（OFL-1.1）；《说文》：shuowen.org（Apache-2.0）。"
}
```

约束：

- `presentationMeta` 只由 `value` 派生，不重新抽随机数；同一个结果重放必须一致。
- 不把完整 `chargeGlyphs`、完整释义塞进 meta；meta 只放视觉需要的字段。模型需要的语义信息在 `value` 里。
- meta 预算控制在几十 KB 内；裂纹点过多时先降采样，不要把会话日志当资产仓库。

#### 行为

1. 归一化 `question` / `charge`；
2. 拆 `charge` 为字，逐字查询；得到 `chargeGlyphs` 与 `missing`；
3. 解析 seed；无 seed 则生成；
4. 由 seed + `tone` + 配置计算 `auspice`；
5. 由 seed + `auspice` + 灼点生成 `CrackSpec`；
6. 返回 `value` 与 `presentationMeta`。

灼点选择：

- 从一组预设的、视觉上合理的龟甲位置中，用 seed 选一个；
- 模型可以传 `burnPoint` 提示，但 host 会 clamp 到甲面范围内；
- 当前不开放“用户手动选灼点”；未来可以作为仪式交互。

### 4.5 `zhenren_inscribe`

#### 输入

```json
{
  "divinationId": "div_01J...",
  "burnSeed": "8f3c...",
  "inscription": {
    "charge": "今其出，亡咎？",
    "prognosis": "其吉，亡咎，福至。"
  },
  "highlight": ["亡", "咎"],
  "layout": { "columns": 3, "direction": "rtl" }
}
```

字段：

- `divinationId` / `burnSeed`：来自 burn 结果，用于卡片视觉连续性与 join；缺失时仍可刻，但会失去同一龟甲的连续性，返回 warning。
- `inscription.prefix`：已废弃，保留只为兼容旧调用；host 一律忽略，并按本机当日干支固定生成 `<干支>卜，<贞人名>贞：`。
- `inscription.charge`：命辞；应与 burn 的命辞一致或为其修订版；不要包含日期、贞人名或“卜”字。
- `inscription.prognosis`：占辞；模型根据 burn 返回的 `auspice` 写。
- `highlight`：可选；希望卡片页脚展示释义的关键字；host 只对这些字返回完整 `shuowen`。
- `layout`：可选；`columns` 是建议值，host 会按字数与甲面 clamp；`direction` 取 `rtl`（右上起、列自右向左，默认）或 `ltr`（左上起、列自左向右），由模型根据甲面留白与兆纹位置自行选择。

#### 输出（模型可见）

```json
{
  "ok": true,
  "divinationId": "div_01J...",
  "prefix": "戊子卜，鱼贞：",
  "missing": ["福"],
  "glyphs": [
    {
      "slot": 0,
      "char": "贞",
      "found": true,
      "headword": "貞",
      "glyphChar": "貞",
      "shuowen": {
        "original": "卜問也。从卜，貝以爲贄。一曰鼎省聲。京房所說。",
        "vernacular": "占卜询问。",
        "vernacularStatus": "draft",
        "correction": null
      }
    },
    {
      "slot": 5,
      "char": "其",
      "found": true,
      "headword": null,
      "glyphChar": "其",
      "shuowen": null
    },
    {
      "slot": 12,
      "char": "福",
      "found": false,
      "placeholder": true,
      "reason": "not-in-oracle-corpus"
    }
  ],
  "layoutSummary": "3 columns, right-to-left",
  "attribution": "字形：Oracular（OFL-1.1）；《说文》：shuowen.org（Apache-2.0）。"
}
```

说明：

- `ok: true` 允许同时有 `missing`。缺字是仪式结果的一部分，不是工具错误。
- `ok: false` 只用于输入非法：空卜辞、超过最大字数、布局无法成立、`divinationId` 格式非法且无法降级。
- `glyphs` 里的 `shuowen` 可以只对 `highlight` 字完整返回；其余字可以只返回 `glossFound`，避免 48 字 × 完整释义把上下文撑大。
- `layoutSummary` 给模型一个可读的布局描述；完整布局在 meta 里。

#### `presentationMeta`（client 可见）

```json
{
  "version": 1,
  "kind": "zhenren.inscribe",
  "divinationId": "div_01J...",
  "burnSeed": "8f3c...",
  "glyphs": [
    { "slot": 0, "char": "贞", "found": true, "glyphChar": "貞" },
    { "slot": 5, "char": "其", "found": true, "glyphChar": "其" },
    { "slot": 12, "char": "福", "found": false, "placeholder": true }
  ],
  "layout": {
    "columns": 3,
    "direction": "rtl",
    "slots": [
      { "index": 0, "column": 2, "row": 0, "x": 0.62, "y": 0.18 }
    ]
  },
  "carve": {
    "version": 1,
    "chars": [
      { "slot": 0, "startMs": 0, "durationMs": 320, "pressure": 0.82, "maskSeed": 12345 }
    ]
  },
  "highlightGlosses": [
    {
      "char": "咎",
      "original": "災也。从人从各。各者，相違也。",
      "vernacular": "灾祸；过失。",
      "correction": null
    }
  ],
  "attribution": "字形：Oracular（OFL-1.1）；《说文》：shuowen.org（Apache-2.0）。"
}
```

约束：

- meta 里的 `glyphs` 只保留渲染必需字段，不重复完整释义；完整释义在 `value` 里给模型。
- 示例的 `layout.slots` 与 `carve.chars` 只列出一个槽位；实际每个槽位都有一条，缺字槽位也有一条（用空刻表现）。
- `highlightGlosses` 只放模型点名的字，最多 5 条；避免卡片变成字典页。
- `carve` 的 `startMs` 是相对本卡片时间线的偏移，不是绝对时间。
- 布局坐标归一化到甲面；client 按自己的 canvas 尺寸缩放。

#### 行为

1. 取本机当日干支，生成固定前辞 `<干支>卜，<贞人名>贞：`，再拼接 `prefix + charge + prognosis`；按字拆；模型传入的 `prefix` 被忽略；
2. 逐字查询，生成 `glyphPlan`；
3. 计算布局；缺字保留槽位；
4. 计算刻辞节奏；
5. 返回 `value` 与 `presentationMeta`；
6. 不修改任何已有记录；这是一次新的工具调用。

### 4.6 `zhenren_verify`（未来）

契约先留出来，当前不实现：

```json
{
  "divinationId": "div_01J...",
  "outcome": "验",
  "note": "三日后成行，途中遇雨，未受伤。"
}
```

返回：

```json
{
  "ok": true,
  "divinationId": "div_01J...",
  "outcome": "验",
  "note": "三日后成行，途中遇雨，未受伤。",
  "attribution": "..."
}
```

设计约束：

- 验辞是**追加记录**，不修改原卜的吉凶、裂纹或卜辞。
- 卡片是一枚小印章/小标签，不是第二块龟甲；它只说明“这次占卜后来怎样”。
- 待验列表是从会话日志派生的事实：有 burn/inscribe、没有对应 verify 的 `divinationId` 就是待验。不建全局数据库。
- 文案必须避免事后归因：验辞是事后记录，不是预言证据。

### 4.7 会话状态

#### 持久层

- dsh 会话日志里的 `tool/call` 与 `tool/result` 是唯一权威档案。
- `divinationId` 是 burn 与 inscribe 的 join key。
- `presentationMeta` 随结果持久化；client 只靠它重放，不需要再请求 host。
- 一次占卜的完整记录 = burn call/result + inscribe call/result（+ 未来 verify call/result）。

#### 进程内

- 可选的 `Map<divinationId, BurnResult>` 缓存，只用于当前进程内快速 join 与避免重复解析。
- 缓存不是权威；进程重启后丢失不影响正确性。
- 缓存必须有界（LRU 或简单上限），不能无限增长。
- 不设模块级单例；缓存放 `apply` 闭包，随插件 fiber 清理。

#### 验证待定状态

- 不用可变布尔标志；用“是否存在 verify 调用”派生。
- 当前范围不做全局待验面板；模型可以在用户主动提起时用 `divinationId` 调 verify。
- 未来若要做待验列表，从会话日志扫描，不引入数据库。

#### 动画句柄

- `presentationMeta.version` 必填；client 校验版本与形状。
- meta 只含 JSON 值；不含函数、`undefined`、`NaN`、`Infinity`。
- 坐标必须是 `[0,1]` 内的有限数；未知字段忽略，缺失必填字段走静态兜底。
- meta 是“可重放的视觉规格”，不是“可执行的动画脚本”；client 负责时间线与插值。

### 4.8 dsh 集成点

#### host

- `apply(ctx)` 注册：
  - `zhenren_burn` 工具；
  - `zhenren_inscribe` 工具；
  - 系统提示词段；
  - 可选 Config。
- host 不注册 slot，不 import React，不读 DOM。
- 工具名是契约的一部分；host 与 client 共享同一组常量，避免字符串漂移。

#### client

- `apply(ctx)` 通过 `ctx.slots.inject('tool.call.toolview', ...)` 注册：
  - `key: 'zhenren_burn'` → `BurnRow`
  - `key: 'zhenren_inscribe'` → `InscribeRow`
  - 未来 `key: 'zhenren_verify'` → `VerifyRow`
- 视图只接收 `ToolCallViewProps`；不直接读 host 配置、不调用 host 数据层。
- 结果阶段从 `block.meta` 读取 `presentationMeta`；开始阶段最多从 `block.argsRaw`/`args` 读初始文案；preparing 阶段显示“贞人正在灼龟……”。
- 卡片挂在会话流里，不挂侧栏、不做全屏遮罩、不做全局 overlay。
- client 不阻塞对话：工具结果已经返回，动画只是叠加播放；用户可以继续输入，卡片可以在后台完成或跳过。

#### 兜底

- `output.render` 必须返回一段可读文本，例如：
  - burn：“贞人灼龟，兆象：中性。命辞：今其出，亡咎？”
  - inscribe：“卜辞已刻：贞：今其出，亡咎？其吉，亡咎。”
- 当 client 半包未加载、slot 未注册、meta 损坏、字体加载失败时，generic 工具行仍然可读。
- 这是硬要求：**没有动画，工具仍然有意义。**

#### 不使用

- 不用 `presentCall` / `presentResult` 的固定卡片承载仪式；它们无法表达 Canvas。
- 不用侧栏 HTML preview 作为主载体；它破坏“会话流里的物质痕迹”。
- 不做全局 Canvas 覆盖层；那会遮挡对话，违背不阻塞原则。

### 4.9 系统提示词

系统提示词段负责“贞人是谁、按什么顺序做事、什么不能做”。工具 `description` 负责参数说明；不要把 JSON schema 抄进提示词。

建议的协议要点：

1. **人格**：你是殷商贞人。语言克制、古雅，但不晦涩。你先问、再灼、再读、再刻，不跳步。
2. **命辞**：把用户的问题凝成一句简短的命辞；不替用户编造事实；不把现代判断塞进命辞。
3. **文体**：卜辞是甲骨卜辞式的记录，不是仿古散文。短句直陈，每句二到六字；实词尽量用单字，避免现代双音节词与白话短语（出行→出，明日→翌，顺利→利，是否→其，近期→今），例如「明日出行是否顺利」写成「翌出，其吉」。不用「乎、哉、兮、矣、也、焉、耳」等语气词，不用骈偶、排比、感叹。表疑问不加「乎/吗」，写「其雨」而不是「其雨乎」；否定用「亡、弗、不」。
4. **灼龟**：先调用 `zhenren_burn`；在工具返回前，不描述裂纹、不宣布吉凶。
5. **读兆**：以工具返回的 `auspice` 为准；占辞必须与它一致；不得改写、反转或“重新解读”成相反结果。
6. **刻辞**：调用 `zhenren_inscribe`，传入命辞、占辞；前辞由 host 固定为 `<干支>卜，<贞人名>贞：`，模型不得另写或在命辞里重复。空刻越少越好：burn 返回 `missing` 时先换字或省略，改写成库内字的单字表达，再刻；确实无法改写时才接受空刻，并向用户说明。
7. **释义**：只有 `shuowen` 非空时才引用《说文》原文；为空时说“《说文》未收此形”或省略；白话转述标为现代转述；古文字纠正带出处。
8. **边界**：兆纹吉凶是艺术约定，不是考古复原；占卜是反思仪式，不是超自然事实。用户追问时如实说明。
9. **语言**：正文跟随用户语言；卜辞用古典中文，但要给现代解读。

提示词段应短（几百字），不要重复工具参数，不要把 1,425 字表塞进去。顺序放在核心系统提示之后、任务型提示之前；具体 `order` 用 `getSectionOrder` 解析，不硬编码猜测值。

### 4.10 配置

建议的 Config 字段：

| 字段 | 类型 | 默认 | 作用 |
| --- | --- | --- | --- |
| `enabled` | boolean | true | 关闭后不注册工具 |
| `animation` | `'full' \| 'reduced' \| 'off'` | `'full'` | 客户端动画级别；系统 reduced-motion 优先 |
| `maxInscriptionChars` | number | 48 | 卜辞上限；超过返回 `invalid` |
| `auspiceBalance` | `'balanced' \| 'gentle' \| 'stern'` | `'balanced'` | 吉凶分布倾向，不改变返回值的权威性 |
| `showShuowen` | boolean | true | 卡片是否展示《说文》原文入口 |
| `locale` | string | `'zh-CN'` | UI 语言；古典文本不翻译 |
| `divinerName` | string | `'鱼'` | 固定前辞 `<干支>卜，<name>贞：` 中的贞人名 |

约束：

- 配置不包含数据路径、字体路径、seed；这些是包内部实现。
- client 不直接读 host 配置；工具结果把需要展示的选择带进 meta。
- 配置变更只影响后续占卜，不改写已有记录。

### 4.11 本地化与隐私

本地化：

- zh-CN 为主 locale；UI chrome 走 locale 字典；不要在组件里硬编码中文。
- 甲骨字、说文原文、出处名是数据，不翻译。
- 白话转述可以按 locale 生成，但必须标为“现代转述”，且不能伪装成原文。
- 模型正文跟随用户语言；卜辞本身可以是古典中文，现代解读用用户语言。

隐私：

- 插件运行时零网络请求；不调用外部占卜 API，不做遥测，不把问题上传到第三方。
- 问题文本留在 dsh 会话日志与模型上下文里；这是 dsh 本身的边界，插件不额外扩散。
- 未来若做导出/分享，必须显式触发；导出物带出处与边界说明；不做后台自动上传。
- 不在日志里额外打印用户问题；错误信息只带必要的 `divinationId` 与错误码。

### 4.12 失败模式

| 失败 | 表现 | 处理 |
| --- | --- | --- |
| `oracle.json` 缺失/损坏 | 工具返回 `data-unavailable` | generic 错误卡；不猜字 |
| 字体加载失败 | Canvas 无法画字 | 显示现代转写 + “字形未加载”；不画 tofu |
| client 半包未加载 | 只有 generic row | `output.render` 文本仍可读 |
| meta 版本未知 | client 不认识 | 静态兜底：最终帧 + 文本，不崩溃 |
| meta 字段缺失/越界 | 坐标、颜色、字形异常 | 校验后降级；缺必填字段走文本兜底 |
| `divinationId` 不匹配 | 两张卡无法视觉连续 | 仍刻；卡片用中性甲面；返回 warning |
| 卜辞过长 | 无法布局 | `ok: false` + 上限；模型缩短后重试 |
| 动画被跳过/离屏 | 播放中断 | 暂停；回来时续播或直接到最终帧 |
| reduced-motion | 用户不适合动画 | 直接最终帧；文本完整 |
| 重复调用 | 模型重试 | 每次调用独立；旧卡片保留；不修改旧记录 |

---

## 5. 动画层

### 5.1 载体选择：Canvas 2D

选择 Canvas 2D，理由：

1. **裂纹是大量短折线**：一次占卜可能有几十条主/支裂纹，每条 10–24 段；SVG/DOM 会产生大量节点，Canvas 一次描边更简单。
2. **材质是像素效果**：灼热光晕、烟、焦痕、刻痕遮罩、纸/骨纹理，都是合成与遮罩问题，Canvas 的 `globalCompositeOperation` 与离屏 canvas 更自然。
3. **字体可以直接画**：`FontFace` 加载 `orac.woff2`，`fillText(glyphChar)` 即可；不需要在构建期抽取 1,425 条 SVG path，不需要复制字形数据，不需要改字体。
4. **没有额外重型依赖**：不引入 WebGL/Three.js；Canvas 2D 是浏览器原生。
5. **单卡片单画布**：每张卡片一个 canvas，不抢全局层，不遮挡对话。

不选其他方案的理由：

- **SVG/DOM**：裂纹节点过多；逐字遮罩与材质合成更麻烦；字体 path 抽取会把字体数据复制一份，且涉及 OFL 修改/子集化问题。
- **WebGL/Three.js**：当前没有 3D 需求；依赖重、调试成本高、移动端兼容性风险大。
- **纯 HTML/CSS**：做不出骨面材质与刻痕；裂纹只能用图片或大量伪元素，反而更重。
- **服务端渲染 GIF/视频**：失去实时重放与交互；字体/数据上传到服务端也违背隐私边界。

Canvas 是展示层，不是事实层。事实是 host 生成的 `RitualSpec`；Canvas 只负责插值与绘制。

### 5.2 时间轴

burn 卡片：

| 阶段 | 时长 | 发生什么 | reduced-motion |
| --- | --- | --- | --- |
| mount | 0 | 甲面纹理出现，卡片标题 | 静态甲面 |
| burn | 1.2–2.0s | 灼点热斑、烟、焦痕扩散 | 直接显示焦痕 |
| crack | 0.8–1.5s | 主裂纹生长，支裂纹跟随 | 直接显示最终裂纹 |
| read | 0.4–0.8s | 光晕退去，吉凶标签出现 | 标签直接出现 |
| hold | ∞ | 最终帧；重放按钮 | 最终帧 |

inscribe 卡片：

| 阶段 | 时长 | 发生什么 | reduced-motion |
| --- | --- | --- | --- |
| mount | 0 | 同一 seed 的甲面出现，裂纹以静态/微光呈现 | 静态 |
| carve | 每字 180–420ms + 间隔 50–120ms | 字逐一刻出，力度不均 | 直接显示完整卜辞 |
| hold | ∞ | 完整卜辞、转写、页脚署名 | 完整卜辞 |

时序原则：

- 客户端时间线独立于 host 延迟。结果早到就存着，先播 burn；结果晚到就停在“灼龟中……”，到了再进入 crack。
- 结果永远不会因为动画没播完而丢失；动画只是把已到达的结果演出来。
- 卡片可以跳过、重放；跳过直达最终帧；重放只重播本卡片，不做跨卡片全局重放（未来可选）。
- 不在动画期间锁输入、不弹模态、不自动滚动抢焦点。

### 5.3 兆纹生成

兆纹由 host 生成，client 只插值。这样保证：

- 文字与图像使用同一个 `auspice`；
- 重放像素一致；
- client 不需要携带裂纹生成器；
- 模型不需要理解原始坐标。

生成函数的概念签名（不是实现代码）：

```ts
generateCracks(input: {
  seed: string
  auspice: '吉' | '凶' | '中性'
  burnPoint: { x: number; y: number }
  bounds: { x: number; y: number; w: number; h: number }
}): CrackSpec
```

`CrackSpec`：

```ts
interface CrackSpec {
  version: 1
  main: {
    points: [number, number][]
    width: number
    breaks: { at: number; length: number }[]
  }
  branches: {
    order: 1 | 2
    startT: number
    points: [number, number][]
    width: number
    breaks: { at: number; length: number }[]
  }[]
  glow: { radius: number; temperature: number; fadeMs: number }
  bounds: { x: number; y: number; w: number; h: number }
}
```

生成规则：

- **确定性 PRNG**：用 seed 的哈希初始化；同一 seed + 同一 auspice + 同一灼点 → 同一裂纹。禁止 `Math.random()`。
- **主裂纹**：从灼点出发，按吉凶对应的方向区间取角；长度按区间取；路径是 10–24 段折线，每段加小幅垂直抖动（例如 ±0.004–0.012），看起来像裂，不像贝塞尔曲线。
- **支裂纹**：从主裂纹的 `startT` 处生长；一级支裂纹 2–5 条；吉/中性可有二级支裂纹；凶很少或没有二级。支裂纹长度随 `1 - startT` 衰减。
- **断裂**：用 `breaks` 表示某段路径的缺失；凶的断裂更多、更宽；吉最多一处短断。
- **宽度**：主裂纹 1.8–2.6（归一化画布单位下的相对值，client 再乘比例）；支裂纹 0.8–1.6；末梢收细。
- **光晕**：灼点处暖色光晕；吉偏暖、持续；凶偏冷/暗、闪动；中性居中。
- **边界**：所有点 clamp 在甲面 `bounds` 内；不允许裂纹跑出甲面。
- **灼点**：从 5 个预设位置中按 seed 选；模型可给提示，host clamp；不在当前范围开放用户手选。

`reading` 摘要由同一几何派生：

```ts
interface OmenReading {
  mainDirection: 'up' | 'down' | 'level'
  branchPattern: 'continuous' | 'broken' | 'symmetric'
  intensity: number // 0..1
}
```

它只用于模型措辞，不是第二套吉凶。模型必须同时遵守 `auspice` 与 `reading`；如果两者在措辞上冲突，以 `auspice` 为准。

### 5.4 吉凶映射

下面的映射是**艺术约定**，不是对真实卜甲兆序的学术复原。

| 维度 | 吉 | 中性 | 凶 |
| --- | --- | --- | --- |
| 主裂纹方向 | 向上/斜上，约 -75°～-45° | 近水平，约 ±15° | 向下/斜下，约 45°～75° |
| 主裂纹长度 | 甲面 0.55–0.75 | 0.45–0.60 | 0.35–0.50 |
| 连续性 | 最多 1 处短断 | 1–2 处断 | 2–3 处断，缺口更宽 |
| 支裂纹数量 | 3–5 条，可带 1–2 条二级 | 3 条 | 2–4 条，少/无二级 |
| 支裂纹方向 | 向外/向上扩散 | 左右对称 | 向内/向下折 |
| 支裂纹长度 | 长，≥0.35 | 中，0.20–0.35 | 短，≤0.20 |
| 末梢光晕 | 暖、稳定 | 中性 | 冷/暗、闪动 |
| 读兆措辞 | “兆干修长，枝兆上扬” | “兆干平直，枝兆均分” | “兆干短促，枝兆下折” |

视觉母题：

- 主裂纹近垂直、一条显著支裂纹近水平，形成类似“卜”的骨架。
- 吉：这条横向支裂纹长、连续、上扬；凶：短、断、下折；中性：左右均衡。
- 这只是一个可读的视觉语法，不代表真实兆象的吉凶规则。

必须写进关于页与文档：

> 兆纹的吉凶映射是艺术化表现，不是考古复原。真实甲骨占卜的兆象解读依赖钻凿位置、灼点、裂纹走向与卜辞语境，远非本插件所能还原。

规则：

- `auspice` 只有一个来源：burn 工具。client 不重算，模型不改写。
- 模型可以传 `tone` 影响分布，但返回的 `auspice` 是最终值。
- `auspiceBalance` 只影响随机分布，不改变“返回值为准”的原则。
- 如果模型在文字里写出与 `auspice` 相反的判断，视为提示词违规；客户端不纠正文字，但卡片标签以 `auspice` 为准。

### 5.5 刻辞节奏

布局：

- 竖列，每列从上到下；列走向由 `layout.direction` 决定：`rtl` 从右上往左下（列自右向左，默认），`ltr` 从左上往右下（列自左向右）。
- host 根据字数与甲面计算槽位；默认最多 4 列 × 12 行；超长返回 `ok: false` 或建议缩短。
- 槽位归一化；client 按 canvas 尺寸缩放。
- 布局尽量避开灼点与主裂纹；避不开时允许“压在裂纹上刻”，因为甲面不是干净纸张。
- 缺字仍占槽位；占位符不是空白卡片，而是“空刻”——少量浅刻痕/浅坑，明确表示“这里没有字”。

逐字节奏：

- 每个字有 `startMs`、`durationMs`、`pressure`、`maskSeed`。
- `durationMs` 由 seed 与字形包围盒面积共同决定，范围约 180–420ms；复杂字略长，但不做笔画数解析。
- `pressure` 0.55–1.0；大部分字中等，少数“重刻”更深、更慢，少数“轻刻”更快、更浅。
- 字与字之间留 50–120ms 的呼吸；第一字前留约 300ms 静默；最后一字后停顿。
- 缺字槽位的停留时间约为正常字的 1.5 倍，让“空”被看见。
- 现代转写与释义在刻完后出现，或始终在卡片下方可读；Canvas 不是唯一阅读路径。

刻痕效果：

- 落刀之前，整篇卜辞先以极淡的底痕（约 0.16 alpha）标出槽位；否则首秒看起来像“没有刻出来”。底痕只是布局提示，不是已完成的刻辞。
- 把字体字形画进离屏 canvas，用 `maskSeed` 生成的碎刻/短划遮罩逐步显露；深色刻痕覆盖底痕。
- 显露顺序大致从上到下、带抖动；不声称是笔画顺序。
- 最终字形保留轻微不均匀的边缘/墨色，不做完美矢量填充。
- 不做“毛笔书写”效果；这是刻，不是写。

### 5.6 材质与视觉

- **色板**：骨白/象牙底；灰褐甲纹；炭黑/深褐裂纹；余烬橙灼点；少量暗红用于吉凶标签或印章。避免高饱和霓虹、塑料高光、卡通描边。
- **甲面**：细密生长纹、孔隙、轻微暖色渐变；读起来像骨面，不像米色矩形。纹理可由 `shellSeed` 程序化生成，也可用静态图；无论哪种，必须随卡片缩放而不糊。
- **卡片框**：安静的博物馆标签式页脚——占卜序号（如“第 N 卜”）、吉凶、出处、关于入口。不要伪造真实的藏品编号或出土信息。
- **运动**：慢、稳、少回弹；裂纹生长是主事件，刻辞是次级事件；不要游戏化弹跳。
- **声音**：当前范围不做。未来如做，默认关闭、需用户手势触发，并遵守 reduced-motion/静音设置。
- **序号**：可以用会话内递增的“第 N 卜”，但必须标明是会话序号，不是历史编号。

### 5.7 可访问性与性能

可访问性：

- 卡片必须有可见文本摘要：问题、命辞、占辞、转写、释义、出处。不是只给 screen reader 的隐藏文本，而是所有人都能读的内容。
- Canvas 只负责视觉；文本层负责语义。Canvas 不替代文本。
- `prefers-reduced-motion: reduce` 时直接最终帧；不强推动画。
- 跳过/重放按钮可键盘操作，触控目标 ≥ 44px。
- 颜色对比满足正文可读；吉凶不只靠颜色区分，必须有文字标签。
- 字体加载失败时显示现代转写，不画 tofu；错误提示要可读。

性能：

- canvas 按 DPR 缩放，内部上限约 1080–1440 宽；DPR 上限 2，避免高分屏过度绘制。
- 离屏/隐藏时暂停 `requestAnimationFrame`；用 IntersectionObserver 或页面可见性 API。
- 粒子/烟尘上限约 120 个；全部在一个 canvas 里画，不用 DOM 粒子。
- 裂纹点预计算；client 只按路径长度插值，不做每帧物理模拟。
- 每个活动卡片最多一个离屏 canvas；卸载时释放；没有全局常驻动画循环。
- 移动端：卡片宽度 100%；canvas 自适应；文本摘要堆叠在下方；布局最多 3 列（host 根据字数 clamp，client 缩放）。

### 5.8 客户端状态机

burn 卡片：

```text
mount
  → burning (animation on)
  → waiting-for-result (if result not arrived)
  → cracking (result available)
  → reading
  → done
```

- 结果可以在任何阶段到达；存起来，时间线到点再消费。
- 结果一直不到 → 超时后显示错误态；不无限转圈。
- 组件 remount（滚动、刷新）→ 读已持久化的 meta，直接到最终帧；不自动重播。
- 用户点“重放” → 从本卡片时间线起点重播；不重新请求 host。

inscribe 卡片：

```text
mount
  → preparing-shell (font/data/meta validation)
  → carving
  → done
```

- meta 无效/版本未知 → 静态兜底；不崩。
- 字体未加载 → 文本兜底；不画空框。
- 缺字 → 占位槽位 + 空刻动画；不是错误态。

状态机是组件本地的；不引入全局 store，不跨卡片共享 React 状态。连续性通过 host 回显的 `divinationId`/`burnSeed` 实现。

### 5.9 重放与持久化

- `presentationMeta.version` 必填；client 校验后决定是否渲染。
- meta 是 JSON；不含函数、`undefined`、`NaN`、`Infinity`；坐标是 `[0,1]` 有限数。
- client 不请求 host 重算；meta 自包含。
- meta 预算：单卡片几十 KB 以内；裂纹点过多时 host 先降采样，不要把会话日志当资产仓库。
- 包版本升级后，旧 meta 可能引用已不存在的字形；client 画空刻或文本兜底，不崩溃。
- 字体与数据随包版本化；manifest 里记录版本；不要把字体做成远程 CDN 依赖。

---

## 6. 长期演进

本节只回答“什么时候值得做”，不回答“什么时候必须完成”。

### 6.1 验辞回访

**什么时候值得做**：用户开始重复问同一类问题，或主动说“后来呢”；一次性占卜不需要。

**做法**：

- 增加 `zhenren_verify` 工具；输入 `divinationId`、`outcome`、`note`。
- 卡片是一枚小印章/小标签，追加在原卜之后；不修改原卜。
- 待验列表从会话日志派生；没有 verify 的 `divinationId` 就是待验；不建数据库。
- 文案强调“验辞是事后记录，不是预言证据”；避免事后归因。

**代价**：多一个工具、多一种卡片状态、多一份隐私考量（验辞可能含个人经历）。值得做的前提是用户真的会回访，而不是为了功能完整。

### 6.2 语料增强

**什么时候值得做**：1,425 字边界成为主要用户抱怨；或出现许可清晰、带字形与释义的甲骨语料。

**候选**：JieZi、OBIMD 等开放甲骨数据集。逐个评估：许可、覆盖、字形格式、学术出处。

**做法**：

- 保持 `OracleRecord` 契约不变；增加 `variants`、`period`、`findspot`、`inscriptionContext`、`glyphSource`。
- 查询可以返回多条记录；UI 可以展示异体字形。
- 字体可能不止一个；渲染层抽象出 `GlyphSource`（码位字体 / SVG path / 图片），不要锁死单一字体。
- 每条记录带 `source`；不混合来源而不标出处。

**不做**：在许可不清时先把数据接进来；用未授权语料“先跑起来”。

### 6.3 部首/声符检索

**什么时候值得做**：用户想按构件找字，或贞人需要为卜辞选一个可用字；核心仪式本身不需要字典浏览。

**数据**：

- `SW` 的 `r`（部首）先做部首索引；这是 Apache-2.0 数据，风险低。
- `BELONG`（6,940 条）与 `XS`（740 条）可以做声符系检索；但音韵/声符来源的许可需要先理清（PHONO-ML CC BY 4.0；广韵形声考无明确开源许可）。
- 在许可未清前，只做部首索引，不发声符系。

**形态**：独立工具或侧栏检索，不塞进占卜卡片；核心仪式不要变成字典浏览器。

**风险**：错误关联会误导用户；每条结果带出处，允许用户查看证据。

### 6.4 多材质

**什么时候值得做**：视觉新鲜感衰退，或用户明确想区分龟腹甲/牛肩胛；材质本身就是仪式的一部分。

**做法**：

- `zhenren_burn` 增加 `material: 'plastron' | 'scapula'`。
- host 的裂纹生成使用材质相关的灼点、甲缝、裂纹拓扑；client 有对应的材质渲染。
- 数据层不变；`material` 进入 meta，重放一致。
- 吉凶映射仍用同一套艺术约定，但材质可以影响主裂纹方向/支裂纹密度；必须在关于页说明。

**不做**：把材质做成纯贴图换肤；裂纹拓扑必须真的不同，否则只是换颜色。

### 6.5 其他书体

**什么时候值得做**：有明确产品需求，且数据/字体许可清晰；不要因为 `seal.woff2` 现成就把篆书塞进甲骨仪式。

**做法**：

- 增加 `script: 'oracle' | 'seal' | 'bronze'` 维度；独立字体、独立数据表。
- 仪式链可能不同：篆书没有灼龟/兆纹，不能复用同一套卡片语义。
- 这是一个独立体验，不是甲骨卡片上的一个开关。

### 6.6 分享与导出

**什么时候值得做**：用户想把结果发给别人；或需要留存。

**做法**：

- 最终帧导出 PNG；可选短 GIF（yigezi 有 GIF89a 编码器先例）。
- 导出物带出处、边界说明、“兆纹为艺术表现”的页脚。
- 不做默认上传；分享必须显式触发。
- 字体许可是 OFL；栅格图不嵌入字体，但仍建议保留署名。

**风险**：导出物脱离上下文后被误读为“真实占卜记录”；页脚必须带边界说明。

### 6.7 演进触发条件

| 演进 | 触发条件 | 不应在此之前做 |
| --- | --- | --- |
| 验辞 | 重复使用 / 用户主动回访 | 核心仪式还不稳定时 |
| 语料增强 | 1,425 边界成为主要抱怨；许可清晰 | 数据契约未稳定时 |
| 部首检索 | 用户明确想按构件找字 | 核心仪式未稳定时 |
| 声符检索 | 许可明确 | 未获明确许可时 |
| 多材质 | 视觉疲劳 / 用户明确要求 | 核心仪式未稳定时 |
| 其他书体 | 明确产品需求 + 独立数据/字体 | 只想复用现有卡片时 |
| 导出 | 分享需求 | 署名机制未就位时 |

---

## 7. 关键设计决策记录

以下决策是后续会话的约束。除非出现新事实，不要重新发明；要改，先改这里，再改代码。

### D1 数据路线：离线抽取 yigezi 内联数据

- **背景**：yigezi 是自包含页面，数据内联；没有稳定 API；运行时抓取会引入网络、解析与许可不确定性。
- **决定**：离线抽取，提交静态 JSON；运行时不依赖 yigezi。
- **后果**：可复现、可审计、启动快；数据更新需要重跑抽取；`.refs` 只是构建输入。
- **替代**：运行时抓取（拒绝：脆弱、网络、许可）；手工建库（拒绝：规模太大）。

### D2 主键与别名层

- **背景**：说文头是朙、亾、㠯、秊、宐、亏，不是现代繁体字；OpenCC 单独解决不了；自动未匹配 229 字，人工裁定后 223 字。更关键的是，1,196 个可释义字形只对应 1,176 个说文头（含手工裁定后 1,202 / 1,181），20 个说文头（含手工后 21）被两个字形共享，单一 `headword` 主键无法同时容纳 1,425 个字形。
- **决定**：两层主键。`headwords` 以 `headword` 为主键（1,181），`glyphs` 以 `glyphChar` 为主键（1,425，`headword` 可空），另有 `aliases` 输入→字形索引。构建期选字头优先级 manual > exact SW > reverse w > OpenCC > TS；运行期查询顺序为精确字形 > 别名 > not found。
- **后果**：字形与释义各自唯一；共享字头只存一份释义；229 字暂时 `headword: null`；简体、繁体、异体、重文都能落到具体字形；不按语义猜。
- **替代**：单表以说文头为主键（拒绝：20 个共享字头破坏唯一性，229 个无头字无处落表）；现代繁体主键（拒绝：丢说文头、与字形错位）；拼音/语义映射（拒绝：会错配释义）。

### D3 `found` 与 `shuowen` 分离

- **背景**：1,425 字都有字形；只有 1,196 字能自动接上《说文》（人工裁定后 1,202）。合并语义会要么丢字，要么编造释义。
- **决定**：`found` = 有甲骨字形；`shuowen` 可空；UI 区分“未在字形库”与“《说文》未收此形”。
- **后果**：229 字仍可刻；模型必须处理 `null`；卡片要能展示“无释义”。
- **替代**：无释义即 `found: false`（拒绝：丢 229 个有效字形）；自动补释义（拒绝：伪造）。

### D4 工具链拆分

- **背景**：仪式有“问、灼、兆、刻、读”多个阶段；单工具会让模型预先决定兆象，或把读兆藏起来。
- **决定**：`zhenren_burn` → `zhenren_inscribe`；prepare 是内部函数；present 是卡片 + 助手文本；`zhenren_verify` 预留。
- **后果**：兆象先于占辞；两张卡片；模型要传 `divinationId`/`burnSeed`；不跨卡片共享 React 状态。
- **替代**：单个全流程工具（拒绝：少一次调用，但兆象变成事后装饰）；单独的 prepare 工具（拒绝：多一个可见步骤，收益小）。

### D5 host 无权威可变状态，会话日志即档案

- **背景**：没有文档化数据库；dsh 会话日志持久化工具调用/结果；`presentationMeta` 可重放。
- **决定**：host 不持有权威可变状态；可选 LRU 缓存；`divinationId` + `presentationMeta` 是持久记录；待验状态派生。
- **后果**：重启安全、可重放、无状态漂移；inscribe 要自带输入；跨卡片连续性靠回显。
- **替代**：进程内 Map 当权威（拒绝：重启丢失）；sidecar 数据库（拒绝：重、无必要）。

### D6 Canvas 2D + 字体

- **背景**：裂纹是大量折线；材质是像素合成；`orac.woff2` 直接按码位映射；没有现成 Canvas 插件范式。
- **决定**：Canvas 2D；`FontFace` 加载 `orac.woff2`；host 给归一化几何；client 插值。
- **后果**：快、自包含、不复制字形数据；Canvas 需要文本层补可访问性；字体许可要遵守。
- **替代**：SVG/DOM（拒绝：节点太多、path 抽取重）；WebGL（拒绝：过度）；纯 HTML/CSS（拒绝：做不出材质）。

### D7 host 生成兆纹规格，单一吉凶

- **背景**：动画与文字必须一致；client 随机会分叉；重放要逐帧一致。
- **决定**：host 确定性生成 `CrackSpec` 与 `auspice`；client 只插值；返回的 `auspice` 是唯一权威；模型必须遵守。
- **后果**：一致、可重放、可调试；meta 要控制大小；client 不能“重掷”。
- **替代**：client 生成（拒绝：分叉、重放不稳）；模型生成几何（拒绝：不可靠、无一致性）。

### D8 缺字 = 空刻占位

- **背景**：1,425 是硬边界；卜辞可能包含未收字。
- **决定**：逐字校验；`missing` + 占位槽；绝不合成；模型可改写或接受空刻；`ok: true` 允许有缺字。
- **后果**：诚实、可读；模型需要修订循环；卡片要能表现“空”。
- **替代**：工具失败（拒绝：打断仪式）；自动换近义字（拒绝：语义错误）。

### D9 无重型运行时依赖，OpenCC 只在构建期

- **背景**：需求要求 OpenCC 归一化，同时禁止 yigezi/dsh 之外的重型依赖；查询集合是封闭的 1,425 字。
- **决定**：构建期用 OpenCC 生成 s2t 别名索引；运行时只查 Map；client/host 都不依赖 OpenCC；静态 JSON + 内存索引；无数据库。
- **后果**：运行时小、确定、离线；表外的字本来就 `found: false`；更新 OpenCC 需重跑构建。
- **替代**：运行时 OpenCC（拒绝：为封闭集合背多 MB 依赖）；手写 s2t（拒绝：易错）。

### D10 许可边界

- **背景**：Oracular OFL-1.1；shuowen.org Apache-2.0；yigezi MIT；PHONO-ML CC BY 4.0；广韵形声考许可不明。
- **决定**：只发布《说文》文本 + 我们的白话转述 + `XZ` 纠正；排除 `mc`/`pos`/`oc`/`ocsrc`；署名落在 notices、关于卡、manifest；当前不子集化字体。
- **后果**：许可面干净；没有音韵功能；数据更小；未来做音韵需单独评估。
- **替代**：带音韵但署名（拒绝：许可不清）；不带署名（拒绝：侵权）。

### D11 内联卡片载体

- **背景**：`presentCall`/`presentResult` 只有固定卡片；HTML preview 在侧栏；没有现成 Canvas 插件。
- **决定**：keyed `tool.call.toolview`；一包 host + client；结果 `meta` 是展示数据；`output.render` 做兜底。
- **后果**：真正内联的 Canvas；要维护 client bundle 与字体；slot key 必须与工具名一致。
- **替代**：固定卡片（拒绝：表达不了仪式）；侧栏 HTML preview（拒绝：不在会话流）；全局 overlay（拒绝：遮挡、阻塞）。

### D12 学术诚实

- **背景**：插件使用真实甲骨字形与《说文》文本，但兆纹吉凶映射是虚构的。
- **决定**：兆纹映射标为艺术约定；《说文》原文逐字引用；白话标为现代转述；纠正带出处；不宣称超自然或考古权威。
- **后果**：可信；需要关于页与页脚；提示词必须约束模型。
- **替代**：包装成真实占卜（拒绝：误导）；完全去历史化（拒绝：失去项目意义）。

### D13 运行时零网络、隐私优先

- **背景**：问题可能涉及个人处境；插件所需数据全部本地。
- **决定**：运行时零 fetch、零遥测、零外部占卜 API；导出/分享必须显式触发；错误日志不带问题原文。
- **后果**：隐私、离线、可预测；更新靠包发布；没有服务端特性。
- **替代**：云端语料查询（拒绝：隐私与依赖）；匿名分析（拒绝：非必要）。

### D14 1,425 边界是一等约束

- **背景**：它是字体与数据的硬上限，影响数据、工具、动画、文本、导出。
- **决定**：每一层都显式处理；库外 `found: false`；库内缺字空刻；无例外。
- **后果**：行为可预测、诚实；模型需要被明确告知；UI 需要解释。
- **替代**：静默替换或生成字形（拒绝：伪造）。

### D15 前辞由 host 固定生成，卜辞用甲骨记录体

- **背景**：模型没有可靠的本地日期，实际输出里出现了「其雨乎」这类后世语气词；用户要求前辞固定为「<当日干支>卜，<贞人名>贞：」，卜辞保持甲骨卜辞的极简记录体。
- **决定**：host 用本地日期计算六十甲子日，在 burn 返回 `dayGanzhi` 与 `prefix`，在 inscribe 强制使用 `prefix` 并忽略模型传入的 `prefix`；提示词禁用语气词与骈偶，实词尽量用单字，疑问写「其雨」而不是「其雨乎」，并优先换字/省略以避免空刻。贞人名放配置 `divinerName`，默认「鱼」。
- **后果**：前辞的日期与格式不再漂移；模型只负责命辞与占辞；跨午夜刻辞会使用刻辞当日而非灼龟当日的干支（当前可接受，若日后需要严格同日本可让 inscribe 复用 memory 中的 `dayGanzhi`）。
- **替代**：让模型自己写前辞（拒绝：无法知道本机日期、格式不稳定）；只在提示词里要求（拒绝：模型仍会漂移）。

### D16 卜辞走向由模型选择

- **背景**：甲骨卜辞的列序并非只有一种读法；同一块甲面上，从右上往左下与从左上往右下都可以成立。固定右起会让布局与具体甲面、兆纹位置脱节，也让模型无法表达“这块甲该往哪边走”的判断。
- **决定**：`zhenren_inscribe` 接受可选 `layout.direction`，取 `rtl`（右上起、列自右向左，默认）或 `ltr`（左上起、列自左向右）；host 只按该值计算槽位，不自行改判。提示词要求模型观察甲面留白与兆纹位置后自行选择。`presentationMeta.layout.direction` 记录最终值，`layoutSummary` 输出 `left-to-right` / `right-to-left`。
- **后果**：布局随模型判断变化，同一段卜辞可能有两种排布；meta 契约与解析器都要校验 `direction`；旧 meta 没有该字段时按 `rtl` 兜底。
- **替代**：固定右起（拒绝：与甲面留白/兆纹位置脱节）；让用户手选（拒绝：仪式中不应多一步交互）；按字数自动选（拒绝：语义与视觉判断应交由贞人）。

---

## 8. 边界、非目标与开放问题

### 8.1 非目标（重申）

- 不做真实占卜服务，不宣称效力。
- 不做完整甲骨学数据库。
- 不做《说文》全译。
- 不做通用动画框架。
- 不做数据库、服务端渲染、运行时爬取、遥测。
- 不做侧栏 HTML 预览主载体。
- 不做字形合成。
- 不做音韵字段（当前范围）。

### 8.2 开放问题与当前立场

| 问题 | 当前立场 | 何时重审 |
| --- | --- | --- |
| 229 个自动未匹配字怎么办 | 默认 `headword: null`；逐步补有出处的 `kind: "headword"` 人工条目；不自动猜 | 用户频繁问到这些字时 |
| 白话转述谁审校 | 先标 `draft`；未审校标“现代转述” | 有审校资源时 |
| 字体是否子集化 | 不子集化；397KB 可接受 | 包体积成为问题时，按 OFL 改名 |
| dsh client API 稳定性 | 只用文档化的 `phase`、`block.meta`、`block.args`；其余不依赖 | dsh 升级导致视图 API 变化时 |
| 兆纹映射是否需要专家审 | 先标艺术约定；如用于教育场景，请领域专家审视觉语法与措辞 | 进入教育/博物馆场景前 |
| 是否接入 JieZi/OBIMD | 先不接；等许可与覆盖清晰 | 1,425 边界成为主要问题时 |
| 是否做声符检索 | 先只做部首；声符许可未清 | 许可明确后 |
| 是否做导出 | 当前不做；如做，必须带出处与边界说明 | 用户明确需要分享时 |
| meta 大小上限 | 先按几十 KB 控制；超了先降采样裂纹 | dsh 会话日志出现压力时 |
| 是否支持英文 UI | zh-CN 优先；古典文本不翻译 | 有英文用户需求时 |
| 是否做多材质 | 当前不做；先稳定核心仪式 | 视觉疲劳/明确需求时 |

### 8.3 什么时候应重新审视本规划

- dsh 增加了一等的自定义卡片/Canvas/动画 API，`tool.call.toolview` 不再是唯一选择。
- yigezi 的数据结构或许可发生变化，抽取脚本或数据契约需要调整。
- 出现许可清晰、覆盖更广的甲骨语料（含字形与释义）。
- 1,425 边界成为主要用户抱怨，而不是可解释的限制。
- 模型无法稳定遵循两步工具链（burn → inscribe），需要合并或增加中间工具。
- 字体许可/Reserved Font Name 成为发布障碍。
- 会话日志对 `presentationMeta` 大小提出硬限制。

---

## 9. 附录

### A. 关键数字

| 项目 | 数量 | 说明 |
| --- | --- | --- |
| `SW` 条目 | 9,815 | 《说文》字头表 |
| 甲骨字 | 1,425 | `HAS_ORAC` 去重 / 字体 cmap |
| 甲骨字 ∩ `SW` | 1,133 | 直接命中 |
| 甲骨-only | 292 | 不是直接 `SW` 键 |
| 经 `TS`/OpenCC 解析 | 23 | 查询口径；OpenCC 未单独拆分 |
| 经反向 `w` 解析 | 40 | 查询口径 |
| 可自动接上《说文》 | 1,196 | 1,133 + 23 + 40 |
| 经人工字头裁定 | 6 | 亡、以、年、春、宜、于；`manual-headword` |
| 随包可释义字形 | 1,202 | 1,196 自动 + 6 人工；`counts.glossedGlyphs` |
| 随包未匹配 | 223 | `counts.glyphOnly`；字形记录 `headword: null` |
| 唯一说文头（随包） | 1,181 | 1,202 个可释义字形归并后的字头数 |
| 共享说文头（随包） | 21 | 被两个甲骨字形共同指向 |
| 字形与说文头不同 | 63 | 绘制用 `glyphChar`，释义用 `headword` |
| 字体 cmap 条目 | 1,426 | `orac.woff2`；含 1 条 U+FFFF 非字符，有效 1,425 |
| 唯一字形 | 1,315 | 102 个共享字形 / 110 个额外码位 |
| `SW` 带 `w` 条目 | 1,061 | 反向重文索引来源 |
| `TS` 条目 | 2,151 | 简体→繁体/异体 |
| `XZ` 条目 | 10 | 古文字纠正 |
| `HAS_SEAL` | 10,249 | 篆书，当前范围外 |
| `BELONG` | 6,940 | 声符系，当前范围外 |
| `XS` | 740 | 声符系字头，当前范围外 |

关于 1,173/252 的说明：那是把变体目标算进甲骨字集合的口径；按“每个甲骨字能否解析到说文头”的正确口径，应使用 **1,196/229**（自动层）或 **1,202/223**（随包数据，含 6 条人工裁定）。

关于 1,196 / 1,202 的说明：两者不是矛盾。1,196 是可自动复现的审计基线；1,202 是 `alias-overrides.json` 里 6 条带出处的人工裁定生效后的随包计数。`extraction-report.json` 的 `resolution` 字段给出完整分解。

### B. JSON 契约示例

#### B.1 OracleLookup

```json
{
  "found": true,
  "query": "其",
  "normalized": "其",
  "glyphChar": "其",
  "headword": null,
  "shuowen": null,
  "matchedBy": "glyph",
  "sources": [
    { "kind": "oracleGlyph", "value": "Oracular (yigezi)" }
  ]
}
```

#### B.2 BurnResult（模型可见）

```json
{
  "divinationId": "div_01J...",
  "seed": "8f3c...",
  "question": "近期是否适合出行？",
  "charge": "贞：今其出，亡咎？",
  "auspice": "中性",
  "reading": {
    "mainDirection": "level",
    "branchPattern": "symmetric",
    "intensity": 0.5
  },
  "burnPoint": { "x": 0.48, "y": 0.38 },
  "chargeGlyphs": [
    { "char": "贞", "found": true, "headword": "貞", "glyphChar": "貞", "glossFound": true }
  ],
  "missing": [],
  "attribution": "字形：Oracular（OFL-1.1）；《说文》：shuowen.org（Apache-2.0）。"
}
```

#### B.3 InscribeResult（模型可见）

```json
{
  "ok": true,
  "divinationId": "div_01J...",
  "missing": ["福"],
  "glyphs": [
    { "slot": 0, "char": "贞", "found": true, "headword": "貞", "glyphChar": "貞" },
    { "slot": 5, "char": "其", "found": true, "headword": null, "glyphChar": "其", "shuowen": null },
    { "slot": 12, "char": "福", "found": false, "placeholder": true, "reason": "not-in-oracle-corpus" }
  ],
  "layoutSummary": "3 columns, right-to-left",
  "attribution": "字形：Oracular（OFL-1.1）；《说文》：shuowen.org（Apache-2.0）。"
}
```

#### B.4 `presentationMeta`（client 可见）

```json
{
  "version": 1,
  "kind": "zhenren.inscribe",
  "divinationId": "div_01J...",
  "burnSeed": "8f3c...",
  "glyphs": [
    { "slot": 0, "char": "贞", "found": true, "glyphChar": "貞" },
    { "slot": 5, "char": "其", "found": true, "glyphChar": "其" },
    { "slot": 12, "char": "福", "found": false, "placeholder": true }
  ],
  "layout": {
    "columns": 3,
    "direction": "rtl",
    "slots": [
      { "index": 0, "column": 2, "row": 0, "x": 0.62, "y": 0.18 }
    ]
  },
  "carve": {
    "version": 1,
    "chars": [
      { "slot": 0, "startMs": 0, "durationMs": 320, "pressure": 0.82, "maskSeed": 12345 }
    ]
  },
  "highlightGlosses": [],
  "attribution": "字形：Oracular（OFL-1.1）；《说文》：shuowen.org（Apache-2.0）。"
}
```

### C. 文件职责

| 文件 | 职责 | 运行时？ |
| --- | --- | --- |
| `data/oracle.json` | 1,425 条字形 + 1,181 条字头 + 别名索引 | 是（host） |
| `data/alias-overrides.json` | 人工字头/别名裁决 | 构建期 |
| `data/manifest.json` | 计数/哈希/许可 | 构建期 + 可选运行时校验 |
| `data/extraction-report.json` | 解析报告/未匹配清单 | 构建期 |
| `data/fonts/orac.woff2` | 字形 | 是（client） |
| `data/fonts/OFL.txt` | 字体许可 | 随包发布 |
| `scripts/extract-yigezi/` | 离线抽取 | 否 |
| `src/data/schema.ts` | 记录/查询类型 | 编译期/运行时校验 |
| `src/data/lookup.ts` | 别名查询 | 是（host） |
| `src/ritual/crack.ts` | 兆纹生成 | 是（host） |
| `src/tools/burn.ts` | `zhenren_burn` | 是（host） |
| `src/tools/inscribe.ts` | `zhenren_inscribe` | 是（host） |
| `src/client/views/BurnRow.tsx` | 灼龟/兆纹卡片 | 是（client） |
| `src/client/views/InscribeRow.tsx` | 刻辞卡片 | 是（client） |
| `src/client/render/cracks.ts` | 裂纹插值/绘制 | 是（client） |
| `src/client/render/carve.ts` | 刻痕遮罩 | 是（client） |

### D. 术语表

- **贞人**：商代主持占卜的人；本插件中由 DeepSeek 扮演。
- **灼龟**：在龟甲/兽骨上灼烧，使正面出现裂纹。
- **兆 / 兆纹**：灼烧产生的裂纹；本插件用艺术化几何表现。
- **卜辞**：刻在甲骨上的占卜记录；通常包含前辞、命辞、占辞、验辞。
- **前辞**：占卜的时间、贞人等背景。
- **命辞**：所问之事。
- **占辞**：对兆象的判断。
- **验辞**：事后记录的结果。
- **重文**：同一字的不同写法；`SW.w` 字段。
- **说文头**：《说文解字》的字头，可能是古文字形（朙、亾、㠯）。
- **字形库**：本插件支持的 1,425 个甲骨字形。
- **空刻**：卜辞中遇到未收字时保留的空白刻位，不是错误，也不是伪造字形。
- **glyphChar**：1,425 字之一，用来索引 `orac.woff2` 的码位。
- **headword**：字头表的主键；说文形体。字形记录通过 `headword` 字段引用它；无释义时为 `null`。

### E. 参考文件

- `.refs/yigezi-main/index.html` — `SW`、`TS`、`XZ`、`HAS_ORAC`、`BELONG`、`XS`。
- `.refs/yigezi-main/orac.woff2` — 甲骨字体。
- `.refs/yigezi-main/seal.woff2` — 篆书字体（当前范围外）。
- `.refs/yigezi-main/THIRD_PARTY_NOTICES.md` — 许可与来源。
- `.refs/yigezi-main/README.md` — 数据规模与项目说明。
- `.refs/deepseek-harness-master/docs/user/develop/basic/tool.md` — 工具注册。
- `.refs/deepseek-harness-master/docs/user/develop/basic/publish.md` — bundle/profile。
- `.refs/deepseek-harness-master/docs/cookbook/extension-cookbook.md` — 插件形态。
- `.refs/deepseek-harness-master/packages/client/ui-tool/README.md` — tool view slot。
- `.refs/deepseek-harness-master/packages/client/ui-tool/src/client/contract/slots.ts` — `ToolCallViewProps`。
- `.refs/deepseek-harness-master/packages/client/ui-conversation/src/client/contract/records.ts` — `ToolResultNode.meta`。
- `.refs/deepseek-harness-master/packages/core/tools/src/presentation.ts` — 固定卡片词汇。
- `.refs/deepseek-harness-master/docs/subsystems/client-modules.md` — client 打包。
- `.refs/deepseek-harness-master/docs/subsystems/slots.md` — slot 生命周期。
- `.refs/deepseek-harness-master/docs/subsystems/system-prompt.md` — 提示词段。
- `.refs/deepseek-harness-master/packages/client/ui-skill/package.json` — host+client 同包示例。
- `.refs/deepseek-harness-master/packages/client/ui-theme/` — 字体资源打包先例。

### F. 后续会话如何使用本文件

1. 先读第 1–4 节，再动手；第 5 节是动画契约，第 7 节是决策约束。
2. 不要改 3.4/3.5/4.4/4.5 的契约而不更新本文件；要改先加一条 ADR。
3. 1,425 边界与 `found: false` 不可协商；不要用“看起来像”的字形补洞。
4. 不引入重型运行时依赖；不加数据库；不把卡片移到侧栏；不做全局 overlay。
5. 第 2 节的事实如果过期，先回 `.refs` 核对，再相信记忆。
6. 目录树是建议，不是契约；契约是接口、数据文件与行为规则。
7. 不要把本文件扩写成执行计划；它只回答“为什么这样、边界在哪、以后往哪走”。
