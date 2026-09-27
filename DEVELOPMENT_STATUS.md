# 开发状态

需求基线：用户附件《GitHub Repository Doctor V1.0 开发需求文档.pages》（32 页）。

## 已完成

- M0–M4（P0）与 M5（P1）的代码、页面和文档已完成；P2 按需求不实现。详情见 [实施计划](IMPLEMENTATION_PLAN.md)。
- 初始 GitHub 仓库 `kola521/judge_hub` 只有 README，没有既有工程约定；已采用文档推荐的 Next.js App Router、React、TypeScript strict、Tailwind CSS、Recharts、Zod 和 Vitest。根目录 `AGENTS.md` 已编写。
- GitHub REST 请求统一经 `lib/github/client.ts`：认证、API 版本、分页、超时、有限重试、条件请求、进程缓存、限流与请求合并。公开仓库主数据必需，其余源部分失败时产生 warning 和明确的 `unavailable` 指标。拒绝分析私有仓库。
- `repo-health-v1` 评分、Coverage 和 Evidence 由纯函数确定性计算；AI 仅按已生成的指标与 Evidence 解释。AI Key 缺失时报告照常生成，AI 区域显示降级。
- DeepSeek Responses 作为唯一可选 AI 适配器，使用结构化 JSON 输出、Zod 结构校验和 Evidence key 白名单；推理模式关闭，失败最多修复一次，不影响程序评分。
- 首页和报告页支持 Fast Scan、Deep Signals、图表、加载/错误/部分数据状态、360px 视口、手动刷新、最近 5 个仓库和调试信息；用户可见文案已改为简体中文。

## 验证结果（2026-09-27）

- `npm run lint`：通过，0 errors / 0 warnings。
- `npm run typecheck`：通过。
- `npm test`：31/31 通过，6 个测试文件。
- `npm run build`：通过；首页、仓库页、API 路由均构建成功。
- 本地生产服务真实调用 `kola521/judge_hub` 与 `facebook/react`，均返回 HTTP 200、六维评分和 Evidence；后者按 GitHub 重定向至 `react/react`。不存在的仓库返回 404。无 AI Key 时返回 `AI_UNAVAILABLE`。浏览器检查首页和报告页，360px 与 1280px 均无水平溢出。
- 审查后补充了私有仓库拒绝、缓存隔离、AI 证据 key 校验、403 状态映射、Dockerfile 识别、上游异常源降级及限流预算的回归测试；四项门禁在这些修复后重跑通过。
- 中文界面及 GitHub 大响应 JSON 解析重试完成后，四项门禁再次通过；`vercel/next.js` 的已关闭 PR 数据在重试后恢复获取，大型目录树仍可能部分失败并明确提示。
- DeepSeek 凭据经供应商余额接口验证可用；真实 `kola521/judge_hub` 完整分析返回中文 AI 解读，且 Evidence 引用通过服务端白名单校验。结构化输出进一步限制 Evidence key 值，减少无效引用；模型偶发输出不合规时仍按需求降级。

## 技术决策

- 仓库指标使用有界分页；超过上限的数量标记 `unavailable` 并给出采样 warning，不推测总数。
- 使用进程内缓存，不引入数据库；在无 Token 情况下 API 限额很低，推荐配置 `GITHUB_TOKEN`。
- 评分以 `generatedAt` 和版本化阈值为输入；AI 输出必须引用已存在的 Evidence key，不能覆盖分数。
- npm 官方 registry 在开发环境连接超时，依赖安装使用 npmmirror；提交标准 `package-lock.json`。

## 已知限制与交付状态

- 用户提供的 DeepSeek Key 已写入仅本机可读的 `.env.local`，该文件被 Git 忽略；生产部署需自行配置 `DEEPSEEK_API_KEY`。无 Key 时核心指标与评分正常。
- Vercel CLI 的临时部署在此环境仍要求登录；当前无 Vercel 凭据，AC-012 Live Demo 尚未完成。本地生产构建和真实 GitHub API 演示已验证。
- 无 Token 时，GitHub 的共享 IP 限额可能导致后续分析出现限流和部分结果；服务端会显示明确状态，不将缺失数据当作零。
- 缓存仅在当前进程有效，多实例之间不共享。
