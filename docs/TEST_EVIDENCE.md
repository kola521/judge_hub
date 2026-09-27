# 测试证据

## 自动门禁（2026-09-27，审查修复后）

- `npm run lint`：exit 0，0 errors / 0 warnings。
- `npm run typecheck`：exit 0。
- `npm test`：exit 0，6 个文件、30 个测试通过。覆盖 URL 解析、GitHub 分页/403/404/304/超时/限流、私有仓库拒绝、Issue/PR 区分、异常源降级与 JSON 解析重试、评分确定性和缺失状态、AI Evidence key，以及报告缓存隔离。
- `npm run build`：exit 0，Next.js 16.3.6 生产构建；静态首页、动态报告页和分析 API 均生成。

## 真实公开仓库与浏览器

- 本地生产 API 输入 `kola521/judge_hub`：HTTP 200，返回真实仓库信息、六维评分、Evidence、Coverage；AI Key 缺失时为 `AI_UNAVAILABLE`，报告仍完整。
- 输入 `facebook/react`：HTTP 200，GitHub 重定向至 `react/react`；达到有界分页上限时指标标记 `unavailable` 并给出采样 warnings。
- 不存在的仓库：HTTP 404。
- 首页和报告页在本地浏览器可访问；360px 视口 `scrollWidth=360`，1280px 视口 `scrollWidth=1280`。
- 中文首页与报告页在本地浏览器可见；配置本地 AI Key 后，`kola521/judge_hub` 仍能完成指标与评分，AI 供应商不可用时显示中文降级提示。
- `vercel/next.js` 复测：GitHub 大响应曾导致若干 `GITHUB_INVALID_RESPONSE`；增加有限 JSON 解析重试后，已关闭 PR 数据恢复，其余大型目录数据仍可能失败并以 `unavailable` 表示。

## 未完成的外部验证

- 本地 AI Key 已配置且未进入版本库；服务商待确认，默认 OpenAI 接口连通性检查超时，真实 AI 文本生成尚未成功验证。已验证结构、Evidence 校验和降级。
- Vercel CLI 无登录凭据，临时部署也进入设备登录流程，尚无 Live Demo URL。
