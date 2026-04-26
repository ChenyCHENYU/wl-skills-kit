# Jenkins Pipeline 参考模板

> **本文件位置**：`kit-internal/jenkins-pipeline.md`
> **读者**：业务项目维护者（搭建/调整 CI/CD 流水线时参考）
>
> ⚠️ wl-skills-kit **不主动注入流水线配置**。本文件提供项目接入 Jenkins 的 **参考模板**，团队可按需采纳。
> 当前主用 CI 平台为 **嘉为蓝鲸**，Jenkins 作为补充/迁移目标。

---

## 1. 流水线职责

| 阶段            | 必要性   | 说明                                                 |
| --------------- | -------- | ---------------------------------------------------- |
| 拉代码 / 装依赖 | ★ 必须   | `pnpm install` / `npm ci`                            |
| Lint            | ★ 必须   | ESLint + Prettier（依赖 @robot-admin/git-standards） |
| Typecheck       | ★ 必须   | `vue-tsc --noEmit`                                   |
| 规范审计        | ☆ 推荐   | `convention-audit` Skill 输出报告作为 PR 评论        |
| 单元测试        | ☆ 推荐   | 业务项目自定义                                       |
| 构建            | ★ 必须   | `vite build`                                         |
| 制品归档        | ★ 必须   | `dist/` 上传到制品库                                 |
| 部署            | ◎ 按环境 | DEV 自动 / UAT 半自动 / PROD 必须人工审批            |

---

## 2. 最简 Jenkinsfile 模板（声明式）

```groovy
pipeline {
  agent { label 'frontend-node20' }

  options {
    timestamps()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    timeout(time: 30, unit: 'MINUTES')
  }

  environment {
    NODE_VERSION = '20'
    PNPM_HOME    = '/var/jenkins_home/.pnpm'
    CI           = 'true'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        sh 'git rev-parse --short HEAD > .git-sha'
      }
    }

    stage('Install') {
      steps {
        sh 'corepack enable && pnpm install --frozen-lockfile'
      }
    }

    stage('Quality Gates') {
      parallel {
        stage('Lint')      { steps { sh 'pnpm lint' } }
        stage('Typecheck') { steps { sh 'pnpm typecheck' } }
      }
    }

    stage('Convention Audit') {
      when { expression { fileExists('.github/skills/core/convention-audit/SKILL.md') } }
      steps {
        // 由 AI 编辑器在 PR 流程外触发；CI 仅校验已有报告未过期
        sh '''
          if [ -d .github/reports ]; then
            latest=$(ls -t .github/reports/AUDIT_HUMAN_*.md 2>/dev/null | head -1)
            if [ -z "$latest" ]; then
              echo "::warning::未发现 AUDIT_HUMAN 报告，建议提交前运行 convention-audit Skill"
            fi
          fi
        '''
      }
    }

    stage('Build') {
      steps {
        sh 'pnpm build'
      }
      post {
        success {
          archiveArtifacts artifacts: 'dist/**/*', fingerprint: true
        }
      }
    }

    stage('Deploy DEV') {
      when { branch 'dev' }
      steps {
        // 业务项目自行实现
        sh './scripts/deploy.sh dev'
      }
    }

    stage('Deploy UAT') {
      when { branch 'uat' }
      steps {
        input message: '是否部署到 UAT?', ok: '部署'
        sh './scripts/deploy.sh uat'
      }
    }

    stage('Deploy PROD') {
      when { branch 'main' }
      steps {
        input message: '⚠️ 部署到生产环境？', ok: '我已确认', submitter: 'release-manager'
        sh './scripts/deploy.sh prod'
      }
    }
  }

  post {
    failure { /* 钉钉/企业微信通知 */ }
    success { /* 通知 */ }
  }
}
```

---

## 3. wl-skills-kit 与 Jenkins 的关系

- **kit 不依赖 Jenkins**：本包仅提供 AI 模板，build/lint 复用项目自身工具链
- **kit 不主动生成 Jenkinsfile**：避免覆盖项目已有流水线
- **审计报告作为 PR 资产**：建议 PR 提交时附 `reports/AUDIT_HUMAN_*.md`，CI 校验"是否在最近 7 天内生成"

---

## 4. 嘉为蓝鲸接入提示

> 嘉为蓝鲸 Pipeline 的语法与 Jenkinsfile 类似，但 stage/step 写法不同。本文件未提供蓝鲸模板，业务项目按企业内部模板实现即可。

关键约束（无论用哪个平台）：

1. `Lint` + `Typecheck` 必须阻断 PR 合并
2. PROD 部署必须**人工审批 + 双人 release manager**
3. 制品保留 ≥ 30 天，便于回滚
4. 失败通知 ≤ 5 分钟内到群

---

## 5. 不在 CI 上跑的事

| 任务                      | 原因                                       |
| ------------------------- | ------------------------------------------ |
| `prototype-scan` Skill    | 需要 AI 模型，CI 不调 LLM（成本+不确定性） |
| `page-codegen` Skill      | 同上                                       |
| `menu-sync` / `dict-sync` | 需要 token，CI 上不存敏感凭证              |
| `code-fix` Skill          | 涉及代码修改，CI 不写回 git                |

> Skill 都是**开发期 IDE 内**触发，CI 只负责 lint + build + deploy。
