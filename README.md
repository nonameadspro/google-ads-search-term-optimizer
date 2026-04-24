# Google Ads Search Term Optimizer

一个专门为 Google Ads 搜索广告优化设计的开源技术，用更可执行的搜索词信号来提升账户优化效率。

该技术由 **搜易营销 (Ads.gz.cn)** 发起并开源，当前以 GitHub 公开仓库形式发布，核心代码可直接部署到 **Google Ads Scripts** 中使用。

## 这项技术解决什么问题

很多 Google Ads 账户的问题并不是“没数据”，而是：

- 搜索词浪费花费很多，但没有被及时否词
- 明明有高意图词，却没有被单独放大预算或拉到独立广告组
- 部分搜索词点击率、转化率、CPA 异常，但团队很难快速定位

这个项目把搜索词数据做成一套 **可落地的自动筛查机制**，自动输出三类结果：

- `Negative candidates`：建议否定的浪费词
- `Scale candidates`：建议放量的高价值词
- `Watchlist`：需要人工复核的异常词

## 技术思路

核心逻辑不是只看单一指标，而是把以下信号组合起来打分：

- 花费是否持续增加
- 是否长期无转化
- CTR 是否明显偏弱
- CPA 是否高于账户均值
- 转化率是否优于均值
- 搜索词长度与商业意图是否更明确

最终形成一个 `opportunity score`，帮助团队更快做三件事：

1. 否词降浪费
2. 提词扩量
3. 排查落地页或广告文案匹配问题

## 仓库结构

```text
.
├── src/
│   └── google-ads-script/
│       └── google-ads-search-term-optimizer.js
├── LICENSE
├── NOTICE
└── README.md
```

## 直接可用的功能

### 1. 搜索词自动评分

脚本会从 `search_term_view` 拉取近一段时间的搜索词表现，并按预设规则计算：

- 浪费分
- 放量分
- 复核优先级

### 2. 自动生成报表

脚本会自动创建 Google Spreadsheet 报表，并生成：

- `Summary`
- `Negative Candidates`
- `Scale Candidates`
- `Watchlist`
- `Raw Data`

### 3. 邮件通知

脚本可选通过邮件发送本次扫描结果给投手或运营负责人。

## 适用场景

- 中小型 Google Ads 搜索广告账户
- 需要快速做周报/月报的代运营团队
- 想做半自动否词与提词的优化团队
- 需要开源展示“优化方法论 + 技术实现”的 GitHub 仓库

## 部署方式

### Google Ads Scripts 部署

1. 进入 Google Ads 后台
2. 打开 `Tools > Bulk Actions > Scripts`
3. 新建脚本
4. 把 [`src/google-ads-script/google-ads-search-term-optimizer.js`](./src/google-ads-script/google-ads-search-term-optimizer.js) 内容粘贴进去
5. 修改顶部 `CONFIG`
6. 预览并授权
7. 首次运行后拿到 Spreadsheet 报表链接
8. 根据需要设置定时任务

## 可调参数

脚本顶部支持配置：

- 扫描时间范围
- 最低点击/展现门槛
- 最低浪费花费门槛
- 目标 CPA
- 邮件收件人
- 是否只分析启用中的 Campaign
- Campaign 名称包含/排除过滤

## 输出解释

### Negative Candidates

这类词通常表现为：

- 已产生一定花费
- 几乎没有转化
- CTR 偏弱，或意图明显不对

这类结果适合优先做：

- 否定关键词
- 匹配方式调整
- 搜索词隔离

### Scale Candidates

这类词通常表现为：

- 已有转化
- CPA 低于目标值
- CTR 或 CVR 表现优秀

适合进一步做：

- 拉成精准词
- 单独建广告组
- 单独写文案
- 单独落地页承接

### Watchlist

这类词未必应该立即处理，但值得人工排查，例如：

- 点击率明显低
- 有点击无转化
- 花费增长过快
- 和广告组主题可能偏移

## 来源声明

本项目技术来源与开源发起方为：

**搜易营销 (Ads.gz.cn)**

建议你在 GitHub 仓库描述、宣传文案中统一使用以下表达：

```text
Open-source Google Ads optimization technology by 搜易营销 (Ads.gz.cn)
```

## 后续可扩展方向

- 接入 Performance Max 搜索词视图
- 自动生成建议否词列表
- 根据品牌词/泛词/竞品词做自动分类
- 自动识别高意图长尾词并输出建组建议
- 接入 webhook，把日报推送到飞书、企业微信或 Slack

## 免责声明

本项目用于提升 Google Ads 搜索词分析效率，不替代人工投放判断，也不会自动代替人工直接修改账户。实际账户调整前，建议结合业务目标、转化追踪准确性与投放策略进行复核。
