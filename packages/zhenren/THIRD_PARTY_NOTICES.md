# 第三方数据与授权声明

本包（`dsh-plugin-zhenren`）随包发布 `data/` 下的字形（字体码位与图像两类）、释义与别名数据。这些内容来自第三方，授权与义务如下。再分发本包或其中数据时，必须保留本文件、`licenses/` 与 `data/fonts/OFL.txt`。

## 1. 甲骨字形字体（原字体 + 改名衍生）

### 1.1 原字体 Oracular（卡片渲染）

- 资产：`data/fonts/orac.woff2`（原样复制，未修改、未重命名、未子集化）
- 名称：Oracular / 镜原甲骨文
- 来源：<https://oracular.azurewebsites.net/>（作者 Peichao Qin，「镜原甲骨数字平台」）
- 授权：**SIL Open Font License 1.1**，全文见 [`data/fonts/OFL.txt`](data/fonts/OFL.txt)
- 字库版权登记号：国作登字-2024-F-00223767
- 义务：随字体保留 OFL 全文与版权声明。原字体用于 Canvas 卡片渲染，按码位 `fillText`，不修改二进制。

字体映射说明：`orac.woff2` 共 1,426 个 cmap 条目，其中 1 条是 U+FFFF 非字符；有效字形码位 1,425 个，唯一字形 1,315 个（102 个字形被 110 个额外码位共享）。数据层按码位索引，不假设「一字形一码位」。

### 1.2 改名衍生 ZhenrenInline（正文内联，D21/D25）

- 资产：`data/fonts/zhenren-inline.woff2`（构建期由 fonttools 生成的改名衍生字体）
- 名称：ZhenrenInline（衍生名，非保留字体名）
- 衍生关系：Oracular 的改名衍生（renamed derivative）。原字体版权 `Copyright (c) Peichao, Qin, 2023` 原样保留。
- 修改声明：cmap 重映射到 Unicode 私有区 U+E000–U+F8FF（使内联甲骨字形与普通汉字码位隔离）；203 个 HUST-OBC 图像字形以 sbix strike 嵌入同一字体；family name 改为 ZhenrenInline。Oracular 的 name 表未声明保留字体名（Reserved Font Name），改名仍按 OFL-1.1 惯例执行。
- 授权：**SIL Open Font License 1.1**，全文与衍生说明见 [`data/fonts/ZhenrenInline-OFL.txt`](data/fonts/ZhenrenInline-OFL.txt)
- 用途：仅服务助手正文内联（`@font-face` + `unicode-range: U+E000-F8FF`）；原字体 Oracular 仍原样随包用于卡片渲染。
- 义务：再分发时保留原版权、衍生说明与 OFL 全文；衍生字体不得单独销售。构建脚本见 `scripts/build-inline-font/`（不随包运行）。

## 2. 甲骨字形图像（HUST-OBC 已释字）

- 资产：`data/glyphs/*.png`（首批精选 203 字，每字一张代表字形）与 `data/oracle.json` 中 `source: "image"` 的字形记录
- 来源：HUST-OBC 已释字图像集（`deciphered/`），论文 **arXiv 2401.15365**（华中科技大学甲骨文字检测与识别数据集）
- 授权：古文字字形本身属**公有领域**；本项目为开源、公益、免费性质，使用其已释字图像作为字形素材。本包只随包分发按现代常用度精选的子集，**不分发 HUST-OBC 全量图库**。
- 原始出处署名（每字保留，见 `glyphs[*].image.source`）：

  | 原始出处 | 首批字数 |
  | --- | --- |
  | 《新甲骨文编》 | 75 |
  | 六位数字编码 | 70 |
  | 国学大师 | 49 |
  | 殷契文渊 | 9 |

- 出处元数据：每个图像字形携带 `image.file`（随包 PNG 路径）、`image.hustId`（HUST-OBC 字 ID）、`image.source`（原始出处名）、`image.citation`（文件名里的著录原文）、`image.collection` / `image.group`（从著录解析的合集号与组类，无则 `null`）。
- 修改声明：构建期对原始拓片/照片做裁剪与墨色归一化（浅底深墨 → 透明底单色墨，128px、留白 0.12），客户端再以刻痕墨色着色，与字体字形风格统一。这是字形素材的格式归一化，不改变字形本身的公有领域性质。
- 义务：再分发时保留 HUST-OBC（arXiv 2401.15365）与上述原始出处署名；不运行时抓取、不做 OCR/相似度匹配、不合成字形。

## 3. 《说文解字》文本

- 资产：`data/oracle.json` 中的 `headwords[*].shuowen.original`、`pinyin`、`radical`
- 来源：<http://www.shuowen.org>（数据仓库 `shuowenjiezi/shuowen`），经 yigezi 整理
- 授权：**Apache License 2.0**，全文见 [`licenses/Apache-2.0.txt`](licenses/Apache-2.0.txt)
- 修改声明（Apache-2.0 §4(b)）：本包抽取 1,425 个字体字形与 203 个图像字形相关的字头（共 1,384 个唯一字头）；删除卷次、反切、音韵等未使用字段；对字头与字形的对应关系做了重新组织，并生成 `headwords`、`glyphs` 与 `aliases` 索引（详见 `data/extraction-report.json`）。《说文》原文逐字保留，未改写。
- `shuowen.vernacular` 是**本项目生成的现代白话转述**，不是 shuowen.org 原文。当前 1,384 个字头均已写入一句草稿转述，状态标 `draft`；卡片与正文以「现代转述」标注，与《说文》原文严格区分。有人审校后再标 `reviewed`。
- `shuowen.correction` 来自 yigezi 的 `XZ` 古文字旁注，按 yigezi 的 MIT 授权使用，并在字段内标注 `source: "yigezi:XZ"`。

## 4. yigezi 数据整理与代码

- 资产：`data/oracle.json` 的整理结构、`data/alias-overrides.json` 的初始内容、`scripts/extract-yigezi/` 的抽取脚本
- 来源：yigezi（快照 `.refs/yigezi-main`）
- 授权：**MIT**，全文见 [`licenses/MIT-yigezi.txt`](licenses/MIT-yigezi.txt)

## 5. OpenCC（仅构建期）

- 用途：构建期生成简体→繁体的别名候选；运行时不依赖 OpenCC。
- 来源：<https://github.com/BYVoid/OpenCC>
- 授权：**Apache License 2.0**
- 随包的 `aliases` 索引由 OpenCC 1.4.2 的结果固化而来；如需替换，重跑 `npm run extract`。

## 6. 明确未随包分发的数据

以下内容本包**不包含**，因此不承担其再分发义务：

| 来源 | 未分发的内容 |
| --- | --- |
| HUST-OBC 全量图库 | 仅随包精选 203 字图像，不分发 65,758 张全量图 |
| 开元小篆 / 全字库说文解字（CNS11643） | 篆书字体与字形 |
| PHONO-ML Database（CC BY 4.0） | `mc`、`pos`、`oc`、`ocsrc` 中古音/上古音字段 |
| 《广韵形声考》（授权未明示） | 上古音拟音 |
| 汉典、小學堂等 | 未采用 |

数据层校验会在构建期拒绝音韵字段进入 `oracle.json`。

## 7. 用户可见署名

完整出处署名集中在本文件与 `README.md`（D26：会话卡片页脚与模型正文不再渲染许可证字样）：

> 字形：Oracular（OFL-1.1）及其改名衍生 ZhenrenInline（OFL-1.1）、HUST-OBC 已释字图像（公有领域，arXiv 2401.15365）。《说文》文本：shuowen.org（Apache-2.0）。数据整理：yigezi（MIT）。

工具返回的 `value` 与 `presentationMeta` 仍保留 `attribution` 字段（契约稳定、供审计），但客户端不再把它渲染进卡片。会话卡片只保留功能性边界说明「兆纹为艺术化表现，非考古复原。」与动态字数行「字形库 N 字；未收字以空刻表示。」（N 随字形库实际字数取值），以及学术出处引用（如古文字纠正的 `yigezi:XZ`）。

## 8. 学术边界

兆纹的吉凶映射是本插件的**艺术约定**，不是殷墟卜甲的考古复原。真实兆象解读依赖钻凿位置、灼点、裂纹走向与卜辞语境，本插件不作学术声明。