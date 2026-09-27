# repo-health-v1 评分方法

评分只使用 `RepositoryMetrics`。同一份指标快照和 `scoreVersion` 产生同一程序分数；日期新旧以快照 `generatedAt` 为参照。阈值位于 `lib/scoring/config.ts`，UI 不包含算分规则。

| 维度 | 总权重 | 子项（维度内权重） |
| --- | ---: | --- |
| Activity | 25% | 30 天提交 22.5%、90 天提交 22.5%、最近提交 30%、活跃贡献者 25% |
| Maintenance | 20% | Issue 处理 25%、PR 处理 25%、最近发布 12.5%、90 天发布次数 12.5%、仓库更新 25% |
| Collaboration | 20% | 贡献者广度 30%、活跃贡献者 30%、头部占比 12.5%、前三占比 12.5%、PR 作者广度 15% |
| Documentation | 15% | README 30%、License 20%、Contributing 20%、Security 15%、Conduct 10%、docs 5% |
| Engineering | 15% | CI 30%、测试信号 25%、依赖清单 20%、构建配置 15%、容器或打包信号 10% |
| Community | 5% | Stars 40%、Forks 35%、Watchers 25%；对数缩放 |

次数目标阈值：90 天提交 90、30 天提交 30、活跃贡献者 8、贡献者广度 12、PR 作者 8、90 天发布 3。处理率目标为 75%。最近活动 30 天以内为满分，365 天及更久为 0，中间线性下降。Community 用 `log1p(value) / log1p(target)`；stars/forks/watchers 目标分别为 10000/1500/1000。布尔工程信号按存在与否计 100 或 0。

每个子项先产生 0–100 的内部得分。仅 `available` 子项参与维度分子和权重分母；`not_applicable` 从适用分母剔除；`unavailable` 不按 0 计分但降低 Coverage。无可用子项的维度为 `unknown`、分数 `null`。总分对已评分维度按原维度权重重新归一化，内部保留小数，最终四舍五入。Coverage = 可用适用信号权重 / 全部适用信号权重。低于 70% 时标记 provisional。状态区间：85–100 Excellent、70–84 Good、50–69 Warning、0–49 Risk、null Unknown。

每个可用子项生成稳定 `evidenceKey`，如 `activity.commits30d`。Evidence 包含事实值、程序描述、方向与可选观察时间。AI Strength/Risk 只能引用这些 key；AI 无权修改分数。

Health Score 仅是可观察 GitHub 信号的启发式指标，不是代码质量、安全性、商业适用性或未来维护承诺的绝对判断。
