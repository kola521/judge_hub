# GitHub Repository Doctor V1.0

一个面向公开 GitHub 仓库的可解释健康分析工具。输入 URL 或 `owner/repo` 后，服务端通过 GitHub REST API 获取真实指标，用固定的 `repo-health-v1` 算法计算六维 Health Score、Analysis Coverage 和 Evidence。AI 只解释这些已披露事实；没有 AI Key 时仍可完成核心分析。

## 功能

- 支持 `https://github.com/owner/repo`、`github.com/owner/repo`、`owner/repo`，自动去掉尾部 `/` 和 `.git`。
- 分批显示 Fast Scan 与 Deep Signals，报告含仓库概览、六维分数和 Evidence、30 天提交趋势、语言占比、工程信号及 AI Insights。
- 支持不可用/不适用状态、部分结果、分页采样、限流、超时、缓存、手动刷新和 AI 降级。
- `?debug=true` 显示请求数、延迟、缓存和剩余限额；浏览器仅用 localStorage 保存最近 5 个成功分析的仓库。

## 技术栈与运行要求

Next.js 16 App Router、React 19、TypeScript strict、Tailwind CSS 4、Recharts、Zod、Vitest。Node.js 20.9 或更新版本。

```bash
npm ci
cp .env.example .env.local
npm run dev
```

打开 `http://localhost:3000`。`GITHUB_TOKEN` 对公开仓库可选，但建议配置以提高 GitHub API 限额。`DEEPSEEK_API_KEY` 可选；未配置时 AI 区域显示降级说明，评分不受影响。`DEEPSEEK_MODEL` 默认为 `deepseek-flash`。真实密钥只放在服务端环境变量，切勿提交 `.env.local`。

## 测试与生产运行

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run start
```

演示流程：在首页输入 `kola521/judge_hub` 或 `facebook/react`；观察首批结果、补全后的 Coverage、六维 Evidence 和三个图表；点击“重新分析”触发条件刷新。可输入不存在的 `owner/repo` 检查错误恢复；移除 AI Key 可验证 AI 独立降级。大型仓库可能达到分页上限，此时总量标为不可用，并显示采样 warning。

## 部署

推荐在 Vercel 导入 GitHub 仓库，Framework Preset 选择 Next.js，设置服务端环境变量 `GITHUB_TOKEN`、可选的 `DEEPSEEK_API_KEY` 与 `DEEPSEEK_MODEL`，构建命令保持 `npm run build`。不需要数据库、后台任务或 Docker。部署后用公开仓库完成一次真实分析，核对 API 限流与区域网络访问。

Live Demo：待 Vercel 项目创建并配置环境变量后填写。当前可使用上述本地命令演示。

## 架构

`app/api/analyze/route.ts` 验证输入并编排分析；`lib/github/client.ts` 是唯一 GitHub HTTP 出口，集中处理认证、API 版本、Link 分页、条件请求、超时、重试、限流与请求合并；`lib/github/repository.ts` 将各数据源映射为 `RepositoryMetrics` 并用 Zod 校验；`lib/scoring` 纯函数产生分数、Evidence 和 Coverage；`lib/ai` 对同一份指标快照生成结构化解释。客户端仅消费聚合响应，不接收上游原始 JSON 或密钥。细节见 [架构说明](docs/ARCHITECTURE.md)。

## 评分方法

Activity 25%、Maintenance 20%、Collaboration 20%、Documentation 15%、Engineering 15%、Community 5%。各子项只对 `available` 计算；`unavailable` 降低 Coverage，`not_applicable` 从适用分母排除。维度和总分对可用权重重新归一化，最终四舍五入为整数；低于 70% Coverage 的分数标为 provisional。阈值集中在 `lib/scoring/config.ts`；完整说明见 [评分方法](docs/SCORING.md)。

Health Score 是基于可观察 GitHub 活动和工程信号的启发式指标，不是软件质量、代码安全、商业适用性或未来维护承诺的绝对判断。Community 仅占 5%，stars 高不会自动代表质量高。

## 限制

- 只分析公开仓库；不克隆仓库，不做源码质量或漏洞扫描。
- 提交、贡献者、Issue 和 PR 使用有界分页；超大型仓库会出现采样与部分结果，不推测完整总量。
- 进程级缓存的命中范围取决于部署实例。Vercel 多实例之间不共享内存缓存。
- 无 AI Key 或供应商故障时没有自然语言 Insights；程序评分和 Evidence 仍可使用。
- 不包含登录、数据库、仓库对比、聊天 Agent 或长期监控。

## 交付记录

里程碑与门禁见 [实施计划](IMPLEMENTATION_PLAN.md)、[开发状态](DEVELOPMENT_STATUS.md) 和 [测试证据](docs/TEST_EVIDENCE.md)。
