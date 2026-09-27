# 架构说明

## 数据流

`RepositorySearch` 规范化 URL → `/repo/[owner]/[repo]` → `POST /api/analyze` Fast Scan → 同一接口 Deep Signals → AI Insights。服务端解析请求后调用 `GitHubClient`，把 REST 响应映射成 `RepositoryMetrics`，再由纯函数 `calculateHealth` 计算 `repo-health-v1`，最后由可选 AI 适配器依据同一份指标、分数和 Evidence 生成解释。

## 模块边界

- `lib/parser/github-url.ts`：无网络依赖的输入解析；拒绝非 GitHub 域名和多余路径。
- `lib/github/client.ts`：唯一 GitHub HTTP 出口。设置 Accept/API 版本头，服务端读取 Token；每次请求 9 秒超时，对网络和部分 5xx 最多再试两次；403/429 按限流头停止；Link 驱动有界分页；7 分钟进程缓存、ETag/Last-Modified、同 URL 请求合并。
- `lib/github/repository.ts`：Repository 硬依赖；其他九组请求并发上限 3，`allSettled` 保留成功数据。Issue 排除带 `pull_request` 的记录，截断的总量置为 unavailable。目录树只检测路径，不读取源码内容。输出经 Zod 校验。
- `lib/scoring`：阈值与权重集中配置。只计算可用数据，产生六维分数、Evidence、Coverage 和 provisional 状态。
- `lib/ai/analyze.ts`：可选服务端 OpenAI Responses 适配器。输入为裁剪后的统一指标与程序评分；结构化 JSON 经 Zod 和 evidenceKey 白名单校验。首次结构错误最多修复一次；失败只影响 AI 区域。
- `lib/analysis.ts`：7 分钟报告缓存和同仓库请求合并；遇限流可返回带 warning 的缓存结果。API 响应再次经 Zod 校验。
- `components/`：客户端展示聚合响应；最近 5 个仓库存在 localStorage，无账号或数据库。

## 状态和安全

`available` 可为 0；`unavailable` 的 value 为 null，不能被误解为 0；`not_applicable` 不参与适用权重。Repository 基础请求失败时返回错误而非分数。单项失败产生稳定代码、Coverage 降低与 partial；AI 缺失或失败产生 `AI_UNAVAILABLE` 等 warning，保持评分可用。API/日志不输出 GitHub Token、AI Key、原始错误堆栈或内部 Prompt。
