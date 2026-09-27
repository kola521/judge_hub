# 测试证据

## 自动门禁（2026-09-27，审查修复后）

- `npm run lint`：exit 0，0 errors / 0 warnings。
- `npm run typecheck`：exit 0。
- `npm test`：exit 0，6 个文件、29 个测试通过。覆盖 URL 解析、GitHub 分页/403/404/304/超时/限流、私有仓库拒绝、Issue/PR 区分、异常源降级、评分确定性和缺失状态、AI Evidence key，以及报告缓存隔离。
- `npm run build`：exit 0，Next.js 16.3.6 生产构建；静态首页、动态报告页和分析 API 均生成。

## 真实公开仓库与浏览器

- 本地生产 API 输入 `kola521/judge_hub`：HTTP 200，返回真实仓库信息、六维评分、Evidence、Coverage；AI Key 缺失时为 `AI_UNAVAILABLE`，报告仍完整。
- 输入 `facebook/react`：HTTP 200，GitHub 重定向至 `react/react`；达到有界分页上限时指标标记 `unavailable` 并给出采样 warnings。
- 不存在的仓库：HTTP 404。
- 首页和报告页在本地浏览器可访问；360px 视口 `scrollWidth=360`，1280px 视口 `scrollWidth=1280`。

## 未完成的外部验证

- 无 `OPENAI_API_KEY`，真实 AI 供应商调用未测；已验证结构、Evidence 校验和降级。
- Vercel CLI 无登录凭据，临时部署也进入设备登录流程，尚无 Live Demo URL。
