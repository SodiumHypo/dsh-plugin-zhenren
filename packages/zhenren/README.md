# 甲骨贞人 · dsh-plugin-zhenren

一个 dsh 插件：用户提问后，DeepSeek 以贞人的身份主持一次甲骨占卜——写出命辞、灼龟取兆、刻辞、以现代语言解释。答案不是漂浮的文本，而是会话流里一张可重放的卡片：同一块龟甲、同一道兆纹、同一篇卜辞。

核心链：**问 → 命辞 → 灼龟 → 兆 → 刻辞 → 读**。

## 内容

- `zhenren_burn`：生成唯一的 `auspice`（吉/凶/中性）、灼点与确定性兆纹；命辞逐字校验，库外字进入 `missing`。
- `zhenren_inscribe`：把前辞、命辞、占辞刻到同一块甲面；前辞由 host 按本机当日干支固定为「戊子卜，鱼贞：」这类格式，缺字保留槽位成为「空刻」，`ok` 仍为 `true`；`layout.direction` 让贞人自己选择从左上往右下（ltr）还是从右上往左下（rtl）刻。
- `zhenren_lookup`：单字科普查询（不起卜、不产生吉凶），返回字形、《说文》释义、字形演变与正文内联码位；库外字返回 `found: false`，不猜近似字。
- 系统提示词段：贞人人格、工具顺序、甲骨卜辞的极简记录体（实词单字、不用语气词）、优先换字或省略以避免空刻、不得改写兆象、不得伪造字形或《说文》引文。`ritualInvoke: auto`（默认）只在占卜意图时起卜，普通问答正常回答；`always` 恢复高权重贞人人格。一旦起卜，协议不变。
- 客户端卡片：Canvas 灼龟/兆纹与逐字刻辞、跳过/重放、`prefers-reduced-motion`、字体或 meta 失效时的纯文本兜底；图像字形与字体字形共用同一套刻痕渲染。
- 正文内联字形（F2）：构建期把 Oracular 重映射为改名衍生字体 ZhenrenInline（私有区 U+E000–F8FF），客户端注入 `@font-face` 并接入正文 font-stack；`zhenren_lookup` 把内联码位交给模型原样穿插正文，普通汉字不受影响。科普卡片始终提供现代字 + 说文 + 演变作为兜底。
- 每日一字（F3）：会话输入框下方的常驻条目，一轮遍历整个字形库（去重、满轮重置），次日更换、同日稳定；展示字形与演变文字，状态存于插件命名空间 localStorage。
- 设置与更新（F4）：设置面板左侧边栏的独立标签「甲骨贞人」提供更新检查开关、更新源选择（npmjs / npmmirror / 自定义）与「清除本地配置」（二次确认，只清 `zhenren.*` 键）。更新检查是唯一的运行时网络豁免：每日至多一次 GET 公共 registry 版本信息，可关闭、失败静默、不上传任何数据，只提示不自动更新。
- 数据：1,628 个甲骨字形（Oracular 字体 1,425 + HUST-OBC 精选图像 203）、1,384 个《说文》字头、762 条别名；`found` 与 `shuowen` 分开表达。
- 释义：1,384 个字头均带一句现代白话转述（状态 `draft`），卡片以「现代转述」标注，与《说文》原文严格区分。

## 构建与测试

```sh
npm install          # 仓库根目录
npm run typecheck
npm run test
npm run build        # 生成 lib/index.js、lib/client.js 与类型声明
node packages/zhenren/scripts/extract-yigezi/index.mjs --check   # 数据不变量
```

数据抽取可重跑（会重写 `packages/zhenren/data/`，但不会覆盖 `alias-overrides.json`）：

```sh
npm run extract
```

## 安装到 dsh profile

从 npm 安装（发布后）：

```sh
dsh plugin --profile demo add dsh-plugin-zhenren@2.0.1
```

从 tarball 安装：

```sh
cd packages/zhenren && npm pack
dsh plugin --profile demo add ./dsh-plugin-zhenren-2.0.1.tgz
```

从本地 checkout 安装（开发）：

```sh
npm install && npm run build          # 仓库根目录
dsh plugin --profile demo add ./packages/zhenren
```

安装后确认 bundle 层已激活：

```sh
dsh --profile demo --dump-config     # 应看到 "# == dsh-plugin-zhenren" 层
dsh --profile demo
```

`dsh.bundle.patch` 指向 `cordis.patch.yml`，它只插入一行：

```yaml
- insert:
    - id: zhenren
      name: dsh-plugin-zhenren
```

profile 可以在自己的 `cordis.patch.yml` 里按 `id: zhenren` 覆盖配置。

## 配置

| 字段 | 类型 | 默认 | 作用 |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | 关闭后不注册工具 |
| `animation` | `full \| reduced \| off` | `full` | 卡片动画级别；系统 reduced-motion 优先 |
| `maxInscriptionChars` | number | `48` | 卜辞汉字上限；超过返回 `ok: false` |
| `auspiceBalance` | `balanced \| gentle \| stern` | `balanced` | 吉凶分布倾向，不改变返回值的权威性 |
| `showShuowen` | boolean | `true` | 卡片是否展示《说文》释义 |
| `locale` | string | `zh-CN` | UI 语言；古典文本不翻译 |
| `divinerName` | string | `鱼` | 固定前辞「<干支>卜，<贞人名>贞：」中的贞人名 |
| `ritualInvoke` | `auto \| always` | `auto` | 起卜权重：`auto` 仅在占卜意图时起卜，普通问答正常回答；`always` 恢复高权重贞人人格 |

profile 覆盖示例：

```yaml
- id: zhenren
  config:
    animation: reduced
    maxInscriptionChars: 36
```

## 边界

- **字形库是硬上限**：当前 1,628 字（字体 1,425 + HUST-OBC 图像 203），随数据版本动态取值；字形只来自随包字体与精选图像，库外字返回 `found: false`，卜辞中表现为空刻，绝不合成字形。
- **`found` ≠ 有释义**：1,441 个字形能接上《说文》，187 个只有字形；后者返回 `headword: null`、`shuowen: null`。
- **单一兆象**：`auspice` 只由 `zhenren_burn` 产生；卡片、占辞、现代解读都从它派生。模型不得改写。
- **兆纹是艺术约定**：吉凶映射不是考古复原；真实兆象依赖钻凿位置、灼点、裂纹走向与卜辞语境。
- **零遥测，唯一网络豁免是更新检查**：运行时只读随包 JSON 与字体，不调用外部占卜 API、不上传问题。唯一的网络请求是可选的更新检查——每日至多一次 GET 公共 registry 的版本元数据（npmjs / npmmirror / 自定义），可在设置里关闭，失败静默，只提示不自动更新，不上传任何用户数据。
- **不阻塞**：工具结果先返回，动画只是叠加播放；client 未加载或崩溃时 `output.render` 的文本仍然可读。

## 目录

```text
data/                     oracle.json、manifest、抽取报告、字体与 OFL、精选图像 glyphs/、client-glyphs.json、inline-map.json
scripts/extract-yigezi/   构建期抽取脚本（不随包运行）
scripts/expand-hust/      HUST-OBC 覆盖审计、选字与图像归一化（构建期）
scripts/vernacular/       白话转述草稿与合并脚本（构建期）
scripts/build-inline-font/  Oracular → ZhenrenInline PUA 重映射 + sbix 嵌入（构建期，D21/D25）
src/data/                 加载、校验、查询
src/ritual/               种子、吉凶、兆纹、布局、刻辞节奏
src/tools/                zhenren_burn、zhenren_inscribe、zhenren_lookup
src/client/               tool.call.toolview 视图、Canvas 渲染、内联字体注入、每日一字、设置与更新
test/                     数据不变量、契约、确定性、静态渲染、每日/设置/更新状态测试
```

## 许可

插件代码 MIT。随包数据与字体的授权、修改声明与许可证全文见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
