# Repository Doctor 开发约定

## 需求与优先级

- 产品事实来源是《GitHub Repository Doctor V1.0 开发需求文档.pages》（由项目负责人提供）。`IMPLEMENTATION_PLAN.md` 是里程碑清单，`DEVELOPMENT_STATUS.md` 记录实际进度与验证结果。
- 优先完成并验证 P0，再做 P1。P2 不进入 V1.0 代码路径。
- 文档中的“明确不做项”必须遵守：不克隆或完整扫描源码；不做漏洞扫描、仓库对比、聊天 Agent、用户系统、数据库、微服务或长期监控。

## 架构边界

- 保持单个 Next.js App Router 项目，TypeScript strict。GitHub Token 和 AI Key 只在服务端读取，绝不写入客户端、日志、API 响应或版本库。
- 所有 GitHub REST 请求通过 `lib/github/client.ts`。保留超时、有限重试、Link 分页上限、条件缓存、限流响应和请求统计；独立数据源的失败不能使其他成功数据丢失。
- `RepositoryMetrics` 是指标、评分、AI 和 UI 的共享事实模型。缺失数据用 `unavailable`，不适用用 `not_applicable`；失败不得伪装为 0。
- `lib/scoring` 的 `repo-health-v1` 是唯一算分实现。AI 只能解释已有指标、分数与 Evidence，不得取数、算分、改分或补造事实。修改权重或阈值时更新版本与测试、README。
- 不把 GitHub 原始响应直接传给页面；所有外部数据在服务端映射并校验。

## 工作方式

- 修改行为前先写能复现目标行为的测试；保持测试关注可观察结果，尤其是分页、Issue/PR 区分、缺失与 NA、归一化、Evidence 和降级。
- 每个里程碑完成后运行 `npm run lint`、`npm run typecheck`、`npm test`、`npm run build`，失败修复后再推进，并把命令结果写入 `DEVELOPMENT_STATUS.md`。
- 进行真实仓库验收时优先使用 `facebook/react` 和 `kola521/judge_hub`；记录网络或限流导致的无法验证项，不能用模拟数据冒充真实结果。
- README 应与实际实现一致，说明配置、启动、测试、部署、演示、评分方法和限制。
