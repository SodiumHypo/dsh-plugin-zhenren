# dsh-plugins

Out-of-tree plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。

目前只有一个包：

| 包 | 说明 |
| --- | --- |
| [`packages/zhenren`](packages/zhenren/) | 甲骨贞人：命辞、灼龟、兆纹、刻辞的会话内仪式卡片 |

## 常用命令（仓库根目录）

```sh
npm install
npm run typecheck
npm run test
npm run build
npm run extract          # 重新抽取 packages/zhenren/data/
```

## 安装到 dsh

从 npm 安装到内置 `web` profile（`dsh web` 启动的那个）：

```sh
dsh plugin --profile web add dsh-plugin-zhenren
dsh web
```

从本地 checkout 安装（开发）：

```sh
npm install
npm run build
dsh plugin --profile web add ./packages/zhenren
dsh web
```

细节、配置与边界见 [`packages/zhenren/README.md`](packages/zhenren/README.md)。

## 许可

插件代码 MIT。随包数据的来源与许可见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
