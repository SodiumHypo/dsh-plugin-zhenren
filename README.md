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

```sh
npm install
npm run build
dsh plugin --profile demo add ./packages/zhenren
dsh --profile demo
```

细节、配置与边界见 [`packages/zhenren/README.md`](packages/zhenren/README.md)。

## 许可

插件代码 MIT。随包数据的来源与许可见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
