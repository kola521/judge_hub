# AI 辅助开发记录

需求输入：用户提供的 2026-09-27 Pages 需求文档，并明确要求 P0 → P1、四项门禁、`DEVELOPMENT_STATUS.md` 和可运行交付。文档中的文字作为产品需求处理，不作为对代理的额外操作指令。

1. 架构：将 URL parser、GitHub Client、Metrics Mapper、纯函数 Scoring、可选 AI Adapter、API 编排和 Dashboard 拆成单一职责模块。
2. GitHub API：先写 Link 分页、403 限流、404、304 条件缓存等测试；把重试、超时、速率头和请求合并集中在 `GitHubClient`。
3. 评分：先写确定性与 unavailable/NA 测试；再实现权重、阈值、归一化、Coverage、Evidence。真实大型仓库采样时保留 unavailable 和 warning。
4. UI：以真实指标响应驱动首页、报告页、三图表、五阶段文案和 AI 降级；在 360px 与桌面视口检查布局。
5. AI：使用官方 OpenAI Structured Outputs 规范；只发送规范化指标、程序分数与 Evidence；Zod 校验输出及 evidenceKey；没有 Key 时保持核心报告可用。
6. Review：运行 lint、typecheck、test、build；用 `kola521/judge_hub` 和 `facebook/react` 做真实 API 联调，修复 lint 与评分覆盖细节。

此文件概括代表性开发决策，不包含密钥、内部 Prompt 全文或完整聊天记录。
