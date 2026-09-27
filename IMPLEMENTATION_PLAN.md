# GitHub Repository Doctor V1.0 实施计划

> 基线：用户提供的《GitHub Repository Doctor V1.0 开发需求文档.pages》（2026-09-27）。本计划按该文档的功能编号与 AC-001 至 AC-012 验收。

## 架构

单个 Next.js App Router 项目。`lib/parser` 负责输入规范化；`lib/github` 集中封装 REST 请求、分页、超时、缓存、限流、请求统计，以及 RepositoryMetrics 映射与校验；`lib/scoring` 纯函数计算六维评分、Coverage 和 Evidence；`lib/ai` 仅解释这些已披露事实；`app/api` 编排；页面消费稳定响应。服务端保管密钥。不引入数据库、账号、Agent、微服务或源码扫描。

## P0 里程碑

- [x] M0 骨架：Next.js、TypeScript strict、Tailwind、ESLint、Vitest、`.env.example`、基础首页。门禁：lint、typecheck、test、build。
- [x] M1 真实数据闭环：三类 URL 解析、标准路由、集中 GitHub Client、Repository/Languages/Commits/Contributors/Issues/PR/Releases/Tree 受控取数、Link 分页、状态模型、Zod 校验、聚合 API、基础页面。验证：真实公开仓库及 404；四项门禁。
- [x] M2 可解释评分：`repo-health-v1` 六维、适用权重归一化、Evidence、Coverage、partial/warnings，固定样本及缺失/NA 测试。四项门禁。
- [x] M3 报告体验：Snapshot、指标、六维证据、Radar、30 日活动、语言图、工程信号、五阶段加载、错误和 AI 降级、360px 响应式。四项门禁。
- [x] M4 AI 与交付：服务端 AI 适配器、结构与 evidenceKey 校验、一次修复、缓存/超时/降级、README、架构与评分说明、集成和真实仓库验收。四项门禁。

## P1 里程碑

- [x] M5 Fast Scan 先展示并由 Deep Signals 补充；`?debug=true` 显示脱敏请求数、延迟、缓存、限流与 Coverage；最近 5 个成功仓库写入 localStorage；ETag/Last-Modified 条件请求。四项门禁。

## P2

文档列出的仓库对比、完整源码和安全扫描、聊天 Agent、用户系统、数据库、微服务、长期监控均不实现。

## 验证记录规则

每个里程碑结束运行 `npm run lint`、`npm run typecheck`、`npm test`、`npm run build`。结果和限制同步到 `DEVELOPMENT_STATUS.md`。上线需要外部 Vercel 项目和环境变量，若环境中没有部署权限，如实标记 AC-012 的 Live Demo 未完成。
