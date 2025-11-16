# Automated PR Review Pipeline Integration

## Overview

This guide covers integrating LLM-based PR reviews into CI/CD pipelines with machine-readable JSON output for automated workflows, quality gates, and reporting.

---

## Table of Contents

1. [JSON Output Schema](#json-output-schema)
2. [Pipeline Integration Architecture](#pipeline-integration-architecture)
3. [Review Automation Workflow](#review-automation-workflow)
4. [Severity Classification](#severity-classification)
5. [Review Report Generation](#review-report-generation)
6. [Quality Gates & Decisions](#quality-gates--decisions)
7. [Multi-Memory MCP in Automation](#multi-memory-mcp-in-automation)
8. [Example Implementations](#example-implementations)

---

## JSON Output Schema

### Review Report Structure

```json
{
  "review_metadata": {
    "timestamp": "2025-01-16T10:30:00Z",
    "branch": "feature/payment-refactor",
    "base_branch": "main",
    "reviewer": "llm-agent",
    "version": "1.0",
    "review_duration_seconds": 45,
    "files_reviewed": 23,
    "files_skipped": 5,
    "token_usage": 85000
  },
  "summary": {
    "total_findings": 15,
    "critical": 2,
    "high": 4,
    "medium": 6,
    "low": 3,
    "recommendation": "REQUEST_CHANGES",
    "blocking_issues": 2
  },
  "findings": [
    {
      "id": "SEC-001",
      "severity": "critical",
      "category": "security",
      "subcategory": "sql_injection",
      "title": "SQL Injection Vulnerability",
      "description": "User input is directly interpolated into SQL query without sanitization or parameterization",
      "file": "src/api/user-controller.ts",
      "line_start": 45,
      "line_end": 47,
      "code_snippet": "const query = `SELECT * FROM users WHERE id = ${req.params.id}`;",
      "recommended_fix": {
        "description": "Use parameterized queries to prevent SQL injection",
        "code_example": "const query = 'SELECT * FROM users WHERE id = ?';\nconst result = await db.query(query, [req.params.id]);"
      },
      "references": [
        "OWASP SQL Injection Prevention",
        "https://owasp.org/www-community/attacks/SQL_Injection"
      ],
      "cwe": "CWE-89",
      "blocking": true
    },
    {
      "id": "PERF-002",
      "severity": "high",
      "category": "performance",
      "subcategory": "n_plus_one",
      "title": "N+1 Query Problem in Loop",
      "description": "Database query executed inside loop causing N+1 query problem for large datasets",
      "file": "src/services/order-service.ts",
      "line_start": 120,
      "line_end": 125,
      "code_snippet": "for (const order of orders) {\n  const user = await db.getUserById(order.userId);\n}",
      "recommended_fix": {
        "description": "Fetch all users in a single query before the loop",
        "code_example": "const userIds = orders.map(o => o.userId);\nconst users = await db.getUsersByIds(userIds);\nconst userMap = new Map(users.map(u => [u.id, u]));\nfor (const order of orders) {\n  const user = userMap.get(order.userId);\n}"
      },
      "impact": "High database load and slow response times with large order lists",
      "blocking": false
    },
    {
      "id": "TEST-003",
      "severity": "medium",
      "category": "testing",
      "subcategory": "missing_coverage",
      "title": "Missing Error Case Tests",
      "description": "New function lacks tests for error scenarios and edge cases",
      "file": "src/utils/validator.ts",
      "line_start": 67,
      "line_end": 89,
      "function": "validatePaymentData",
      "recommended_fix": {
        "description": "Add tests for error cases: invalid input, null values, boundary conditions",
        "code_example": "describe('validatePaymentData', () => {\n  it('should throw on null amount', () => {\n    expect(() => validatePaymentData({ amount: null })).toThrow();\n  });\n  it('should throw on negative amount', () => {\n    expect(() => validatePaymentData({ amount: -10 })).toThrow();\n  });\n});"
      },
      "missing_tests": [
        "null/undefined inputs",
        "negative amounts",
        "currency code validation",
        "amount precision limits"
      ],
      "blocking": false
    },
    {
      "id": "ARCH-004",
      "severity": "medium",
      "category": "architecture",
      "subcategory": "pattern_violation",
      "title": "Inconsistent Error Handling Pattern",
      "description": "Error handling does not follow project's standard error response format",
      "file": "src/api/payment-controller.ts",
      "line_start": 156,
      "line_end": 160,
      "code_snippet": "catch (error) {\n  res.status(500).json({ error: error.message });\n}",
      "recommended_fix": {
        "description": "Use the standard error response format defined in base controller",
        "code_example": "catch (error) {\n  return this.errorResponse(res, {\n    code: 'PAYMENT_ERROR',\n    message: 'Payment processing failed',\n    details: error.message\n  });\n}",
        "reference_file": "src/api/base-controller.ts"
      },
      "pattern_source": "project_convention",
      "blocking": false
    },
    {
      "id": "QUAL-005",
      "severity": "low",
      "category": "code_quality",
      "subcategory": "naming",
      "title": "Unclear Variable Name",
      "description": "Variable name 'data' is too generic and doesn't convey purpose",
      "file": "src/services/notification-service.ts",
      "line_start": 89,
      "line_end": 89,
      "code_snippet": "const data = await fetchUserPreferences(userId);",
      "recommended_fix": {
        "description": "Use descriptive variable name",
        "code_example": "const userPreferences = await fetchUserPreferences(userId);"
      },
      "blocking": false
    }
  ],
  "automated_checks": {
    "linter": {
      "status": "passed",
      "errors": 0,
      "warnings": 3,
      "details": [
        {
          "file": "src/utils/helper.ts",
          "line": 23,
          "rule": "no-console",
          "message": "Unexpected console.log statement"
        }
      ]
    },
    "type_check": {
      "status": "passed",
      "errors": 0
    },
    "tests": {
      "status": "passed",
      "total": 145,
      "passed": 145,
      "failed": 0,
      "coverage": {
        "lines": 87.5,
        "branches": 82.3,
        "functions": 91.2,
        "statements": 87.8
      },
      "coverage_delta": {
        "lines": -2.1,
        "note": "Coverage decreased - new code not fully tested"
      }
    },
    "security_scan": {
      "status": "failed",
      "tool": "semgrep",
      "critical": 1,
      "high": 2,
      "medium": 3,
      "findings_mapped_to": ["SEC-001"]
    },
    "build": {
      "status": "passed",
      "duration_seconds": 23
    }
  },
  "files_analyzed": [
    {
      "path": "src/api/user-controller.ts",
      "lines_changed": 45,
      "priority": "critical",
      "findings": ["SEC-001"],
      "review_depth": "full_file"
    },
    {
      "path": "src/services/order-service.ts",
      "lines_changed": 78,
      "priority": "high",
      "findings": ["PERF-002"],
      "review_depth": "full_file"
    },
    {
      "path": "src/utils/validator.ts",
      "lines_changed": 23,
      "priority": "medium",
      "findings": ["TEST-003"],
      "review_depth": "diff_only"
    },
    {
      "path": "README.md",
      "lines_changed": 12,
      "priority": "low",
      "findings": [],
      "review_depth": "skipped",
      "skip_reason": "documentation_only"
    }
  ],
  "hotspots_triggered": [
    {
      "file": "src/api/user-controller.ts",
      "reason": "Known security hotspot - 8 previous issues",
      "extra_scrutiny_applied": true
    }
  ],
  "knowledge_applied": {
    "project_rules_checked": 12,
    "anti_patterns_matched": 2,
    "patterns_from_memory": [
      {
        "rule": "sql_injection_prevention",
        "matched": true,
        "finding_id": "SEC-001"
      },
      {
        "rule": "error_response_format",
        "matched": true,
        "finding_id": "ARCH-004"
      }
    ]
  },
  "metrics": {
    "files_changed": 23,
    "lines_added": 456,
    "lines_removed": 234,
    "net_change": 222,
    "largest_file_changed": {
      "path": "src/services/order-service.ts",
      "lines": 1234
    },
    "complexity_delta": "+12%",
    "estimated_review_time_human_minutes": 35
  }
}
```

---

## Pipeline Integration Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    CI/CD Pipeline Trigger                    │
│              (PR created/updated, commit pushed)             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Step 1: Environment Setup                   │
│  - Clone repository                                          │
│  - Checkout PR branch                                        │
│  - Install dependencies                                      │
│  - Configure Multi-Memory MCP connection                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Step 2: Automated Checks (Parallel)             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Linter  │  │   Type   │  │  Tests   │  │ Security │   │
│  │          │  │  Check   │  │ +Coverage│  │   Scan   │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│       ▼             ▼             ▼             ▼          │
│  [ Results collected in structured format ]                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│           Step 3: LLM Agent Review (Conditional)             │
│                                                              │
│  Decision Logic:                                             │
│  IF (files_changed > 50) THEN                                │
│    Spawn multiple agents (parallel review)                   │
│  ELSE IF (any security-sensitive files) THEN                 │
│    Deep review with Memory MCP context                       │
│  ELSE                                                        │
│    Standard single-agent review                              │
│  END                                                         │
│                                                              │
│  Agent Process:                                              │
│  1. Load context from Multi-Memory MCP                       │
│  2. Get file prioritization                                  │
│  3. Review based on token budget                             │
│  4. Generate findings                                        │
│  5. Store learnings to Multi-Memory MCP                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│         Step 4: Generate JSON Report                         │
│  - Aggregate all findings                                    │
│  - Classify severity                                         │
│  - Generate recommendations                                  │
│  - Calculate metrics                                         │
│  - Output: review-report.json                                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Step 5: Quality Gate Decision                   │
│                                                              │
│  IF (critical_findings > 0) THEN                             │
│    STATUS = "FAILED" (blocking)                              │
│  ELSE IF (high_findings > threshold) THEN                    │
│    STATUS = "FAILED" (blocking)                              │
│  ELSE IF (medium_findings > 0) THEN                          │
│    STATUS = "WARNING" (non-blocking)                         │
│  ELSE                                                        │
│    STATUS = "PASSED"                                         │
│  END                                                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Step 6: Report Publishing                       │
│  - Post summary as PR comment                                │
│  - Upload full JSON as artifact                              │
│  - Send notifications (if configured)                        │
│  - Update dashboard/metrics                                  │
└─────────────────────────────────────────────────────────────┘
```

### Pipeline Configuration Structure

```yaml
# Generic pipeline structure (platform-agnostic)

trigger:
  - pull_request

stages:
  - stage: code_review
    jobs:
      - job: automated_checks
        parallel: true
        tasks:
          - lint
          - type_check
          - test_with_coverage
          - security_scan
        outputs:
          - lint_results.json
          - type_check_results.json
          - test_results.json
          - coverage_report.json
          - security_scan_results.json

      - job: llm_review
        depends_on: automated_checks
        environment:
          MCP_SERVER_URL: $(MCP_SERVER_ENDPOINT)
          ANTHROPIC_API_KEY: $(ANTHROPIC_KEY)
        steps:
          - checkout_code
          - install_dependencies
          - run_llm_review_script
        outputs:
          - review-report.json

      - job: aggregate_and_decide
        depends_on: [automated_checks, llm_review]
        steps:
          - aggregate_findings
          - apply_quality_gates
          - generate_final_report
        outputs:
          - final-review.json
          - review-summary.md

      - job: publish_results
        depends_on: aggregate_and_decide
        steps:
          - post_pr_comment
          - upload_artifacts
          - update_metrics
```

---

## Review Automation Workflow

### Script Entry Point

```typescript
// review-automation.ts
import { runAutomatedReview } from './lib/automated-review';

async function main() {
  // Get context from CI environment
  const context = {
    branchName: process.env.SOURCE_BRANCH,
    baseBranch: process.env.TARGET_BRANCH,
    prNumber: process.env.PR_NUMBER,
    commitSha: process.env.COMMIT_SHA,
    workspace: process.env.WORKSPACE_PATH,
  };

  // Run review
  const report = await runAutomatedReview(context);

  // Write JSON output
  const outputPath = process.env.OUTPUT_PATH || './review-report.json';
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2));

  // Exit with appropriate code
  const exitCode = determineExitCode(report);
  process.exit(exitCode);
}

function determineExitCode(report: ReviewReport): number {
  if (report.summary.critical > 0) return 1; // Fail pipeline
  if (report.summary.high > 5) return 1;     // Configurable threshold
  return 0; // Pass
}

main().catch(error => {
  console.error('Review failed:', error);
  process.exit(2); // Error exit code
});
```

### Core Review Logic

```typescript
// lib/automated-review.ts
interface ReviewContext {
  branchName: string;
  baseBranch: string;
  prNumber?: string;
  commitSha: string;
  workspace: string;
}

interface ReviewReport {
  review_metadata: ReviewMetadata;
  summary: ReviewSummary;
  findings: Finding[];
  automated_checks: AutomatedChecks;
  files_analyzed: FileAnalysis[];
  hotspots_triggered: Hotspot[];
  knowledge_applied: KnowledgeApplied;
  metrics: Metrics;
}

async function runAutomatedReview(context: ReviewContext): Promise<ReviewReport> {
  const startTime = Date.now();

  // 1. Get changed files
  const changedFiles = await getChangedFiles(context);

  // 2. Run automated checks in parallel
  const automatedChecks = await runAutomatedChecks(changedFiles);

  // 3. Load project knowledge from Multi-Memory MCP
  const knowledge = await loadProjectKnowledge();

  // 4. Prioritize files
  const prioritizedFiles = await prioritizeFiles(changedFiles, knowledge);

  // 5. Determine review strategy based on size
  const strategy = determineReviewStrategy(prioritizedFiles);

  // 6. Execute review
  let findings: Finding[];
  if (strategy === 'multi_agent') {
    findings = await multiAgentReview(prioritizedFiles, knowledge);
  } else {
    findings = await singleAgentReview(prioritizedFiles, knowledge);
  }

  // 7. Merge findings from automated checks
  findings = mergeFindingsWithAutomatedChecks(findings, automatedChecks);

  // 8. Classify and sort findings
  findings = classifyAndSortFindings(findings);

  // 9. Store learnings back to Multi-Memory MCP
  await storeReviewLearnings(findings, context);

  // 10. Generate report
  const report: ReviewReport = {
    review_metadata: {
      timestamp: new Date().toISOString(),
      branch: context.branchName,
      base_branch: context.baseBranch,
      reviewer: 'llm-agent',
      version: '1.0',
      review_duration_seconds: Math.floor((Date.now() - startTime) / 1000),
      files_reviewed: prioritizedFiles.filter(f => f.reviewed).length,
      files_skipped: prioritizedFiles.filter(f => !f.reviewed).length,
      token_usage: getTokenUsage(),
    },
    summary: generateSummary(findings),
    findings,
    automated_checks: automatedChecks,
    files_analyzed: prioritizedFiles,
    hotspots_triggered: knowledge.hotspots,
    knowledge_applied: {
      project_rules_checked: knowledge.rules.length,
      anti_patterns_matched: countAntiPatternsMatched(findings),
      patterns_from_memory: knowledge.patterns,
    },
    metrics: calculateMetrics(changedFiles),
  };

  return report;
}
```

### File Prioritization Logic

```typescript
async function prioritizeFiles(
  files: ChangedFile[],
  knowledge: ProjectKnowledge
): Promise<PrioritizedFile[]> {
  return files.map(file => {
    let priority: Priority = 'low';
    let reason: string[] = [];

    // Check if file is a hotspot
    const hotspot = knowledge.hotspots.find(h => h.file_path === file.path);
    if (hotspot) {
      priority = 'critical';
      reason.push(`Known hotspot: ${hotspot.note}`);
    }

    // Check if security-sensitive
    if (isSecuritySensitive(file.path)) {
      priority = 'critical';
      reason.push('Security-sensitive file');
    }

    // Check change size
    if (file.linesChanged > 100) {
      priority = priority === 'critical' ? priority : 'high';
      reason.push('Large change (>100 lines)');
    }

    // Check file type
    if (isGeneratedFile(file.path)) {
      priority = 'skip';
      reason.push('Generated file');
    }

    return {
      ...file,
      priority,
      reason,
      review_depth: determineReviewDepth(file, priority),
    };
  });
}

function isSecuritySensitive(path: string): boolean {
  const patterns = [
    /auth/i,
    /payment/i,
    /security/i,
    /api\/.*controller/i,
    /middleware.*auth/i,
  ];
  return patterns.some(pattern => pattern.test(path));
}

function determineReviewDepth(
  file: ChangedFile,
  priority: Priority
): ReviewDepth {
  if (priority === 'skip') return 'skipped';
  if (priority === 'critical') return 'full_file';
  if (file.linesTotal > 1000) return 'diff_only';
  if (priority === 'high') return 'full_file';
  return 'diff_only';
}
```

### Finding Classification

```typescript
function classifyFinding(finding: RawFinding): Finding {
  // Determine severity
  let severity: Severity = 'low';

  if (finding.category === 'security') {
    severity = 'critical';
  } else if (finding.category === 'performance' && finding.impact === 'high') {
    severity = 'high';
  } else if (finding.category === 'testing' && finding.missing_coverage) {
    severity = 'medium';
  }

  // Determine if blocking
  const blocking = severity === 'critical' ||
                   (severity === 'high' && finding.category === 'security');

  // Generate unique ID
  const id = generateFindingId(finding);

  return {
    id,
    severity,
    blocking,
    ...finding,
  };
}

function generateFindingId(finding: RawFinding): string {
  const prefix = {
    security: 'SEC',
    performance: 'PERF',
    testing: 'TEST',
    architecture: 'ARCH',
    code_quality: 'QUAL',
  }[finding.category] || 'MISC';

  const hash = hashFinding(finding); // Use file + line + category
  const counter = getNextCounter(prefix); // Increment counter

  return `${prefix}-${counter.toString().padStart(3, '0')}`;
}
```

---

## Severity Classification

### Severity Levels

| Severity | Description | Pipeline Impact | Examples |
|----------|-------------|-----------------|----------|
| **Critical** | Security vulnerabilities, data loss risks | Blocks merge/deployment | SQL injection, XSS, exposed secrets, auth bypass |
| **High** | Performance issues, significant bugs | Configurable (default: block) | N+1 queries, memory leaks, race conditions, broken error handling |
| **Medium** | Code quality, maintainability | Warning only | Missing tests, pattern violations, code duplication |
| **Low** | Style, minor improvements | Informational | Naming, comments, minor refactoring suggestions |

### Classification Rules

```typescript
interface SeverityRule {
  category: string;
  subcategory?: string;
  condition?: (finding: RawFinding) => boolean;
  severity: Severity;
}

const SEVERITY_RULES: SeverityRule[] = [
  // Critical
  { category: 'security', subcategory: 'sql_injection', severity: 'critical' },
  { category: 'security', subcategory: 'xss', severity: 'critical' },
  { category: 'security', subcategory: 'auth_bypass', severity: 'critical' },
  { category: 'security', subcategory: 'exposed_secrets', severity: 'critical' },
  { category: 'security', subcategory: 'command_injection', severity: 'critical' },

  // High
  { category: 'performance', subcategory: 'n_plus_one', severity: 'high' },
  { category: 'performance', subcategory: 'memory_leak', severity: 'high' },
  { category: 'reliability', subcategory: 'race_condition', severity: 'high' },
  { category: 'reliability', subcategory: 'error_handling', severity: 'high' },

  // Medium
  { category: 'testing', subcategory: 'missing_coverage', severity: 'medium' },
  { category: 'architecture', subcategory: 'pattern_violation', severity: 'medium' },
  { category: 'code_quality', subcategory: 'duplication', severity: 'medium' },

  // Low
  { category: 'code_quality', subcategory: 'naming', severity: 'low' },
  { category: 'code_quality', subcategory: 'comments', severity: 'low' },
  { category: 'style', severity: 'low' },
];

function determineSeverity(finding: RawFinding): Severity {
  for (const rule of SEVERITY_RULES) {
    if (finding.category === rule.category) {
      if (!rule.subcategory || finding.subcategory === rule.subcategory) {
        if (!rule.condition || rule.condition(finding)) {
          return rule.severity;
        }
      }
    }
  }
  return 'low'; // Default
}
```

---

## Review Report Generation

### Report Builder

```typescript
class ReviewReportBuilder {
  private findings: Finding[] = [];
  private automatedChecks: AutomatedChecks;
  private metadata: ReviewMetadata;
  private filesAnalyzed: FileAnalysis[] = [];

  addFinding(finding: Finding): void {
    this.findings.push(finding);
  }

  setAutomatedChecks(checks: AutomatedChecks): void {
    this.automatedChecks = checks;
  }

  setMetadata(metadata: ReviewMetadata): void {
    this.metadata = metadata;
  }

  addFileAnalysis(file: FileAnalysis): void {
    this.filesAnalyzed.push(file);
  }

  build(): ReviewReport {
    // Sort findings by severity
    const sortedFindings = this.findings.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    // Generate summary
    const summary = {
      total_findings: sortedFindings.length,
      critical: sortedFindings.filter(f => f.severity === 'critical').length,
      high: sortedFindings.filter(f => f.severity === 'high').length,
      medium: sortedFindings.filter(f => f.severity === 'medium').length,
      low: sortedFindings.filter(f => f.severity === 'low').length,
      blocking_issues: sortedFindings.filter(f => f.blocking).length,
      recommendation: this.determineRecommendation(sortedFindings),
    };

    return {
      review_metadata: this.metadata,
      summary,
      findings: sortedFindings,
      automated_checks: this.automatedChecks,
      files_analyzed: this.filesAnalyzed,
      hotspots_triggered: [], // Filled by caller
      knowledge_applied: {}, // Filled by caller
      metrics: {}, // Filled by caller
    };
  }

  private determineRecommendation(findings: Finding[]): string {
    const hasCritical = findings.some(f => f.severity === 'critical');
    const highCount = findings.filter(f => f.severity === 'high').length;

    if (hasCritical) return 'REQUEST_CHANGES';
    if (highCount > 5) return 'REQUEST_CHANGES';
    if (findings.length === 0) return 'APPROVE';
    return 'COMMENT';
  }
}
```

### Human-Readable Summary Generation

```typescript
function generateMarkdownSummary(report: ReviewReport): string {
  const { summary, findings } = report;

  let md = `# 🔍 Automated PR Review\n\n`;

  // Summary section
  md += `## 📊 Summary\n\n`;
  md += `- **Recommendation**: ${getRecommendationEmoji(summary.recommendation)} **${summary.recommendation}**\n`;
  md += `- **Total Findings**: ${summary.total_findings}\n`;
  md += `  - 🔴 Critical: ${summary.critical}\n`;
  md += `  - 🟠 High: ${summary.high}\n`;
  md += `  - 🟡 Medium: ${summary.medium}\n`;
  md += `  - 🔵 Low: ${summary.low}\n`;
  md += `- **Blocking Issues**: ${summary.blocking_issues}\n\n`;

  // Critical and High findings
  const criticalAndHigh = findings.filter(f =>
    f.severity === 'critical' || f.severity === 'high'
  );

  if (criticalAndHigh.length > 0) {
    md += `## ⚠️ Critical & High Priority Issues\n\n`;
    for (const finding of criticalAndHigh) {
      md += formatFindingMarkdown(finding);
    }
  }

  // Automated checks
  md += `## 🤖 Automated Checks\n\n`;
  md += formatAutomatedChecks(report.automated_checks);

  // Metrics
  md += `## 📈 Metrics\n\n`;
  md += `- Files Changed: ${report.metrics.files_changed}\n`;
  md += `- Lines Added: +${report.metrics.lines_added}\n`;
  md += `- Lines Removed: -${report.metrics.lines_removed}\n`;
  md += `- Net Change: ${report.metrics.net_change}\n\n`;

  // Footer
  md += `---\n`;
  md += `_Full report available as artifact: \`review-report.json\`_\n`;

  return md;
}

function formatFindingMarkdown(finding: Finding): string {
  const emoji = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🔵',
  }[finding.severity];

  let md = `### ${emoji} [${finding.id}] ${finding.title}\n\n`;
  md += `**Severity**: ${finding.severity.toUpperCase()}`;
  if (finding.blocking) md += ` ⛔ (Blocking)`;
  md += `\n\n`;
  md += `**File**: \`${finding.file}:${finding.line_start}\`\n\n`;
  md += `**Description**: ${finding.description}\n\n`;

  if (finding.code_snippet) {
    md += `**Current Code**:\n\`\`\`\n${finding.code_snippet}\n\`\`\`\n\n`;
  }

  if (finding.recommended_fix) {
    md += `**Recommended Fix**:\n${finding.recommended_fix.description}\n\n`;
    if (finding.recommended_fix.code_example) {
      md += `\`\`\`\n${finding.recommended_fix.code_example}\n\`\`\`\n\n`;
    }
  }

  md += `---\n\n`;
  return md;
}
```

---

## Quality Gates & Decisions

### Configurable Quality Gate Rules

```typescript
interface QualityGateConfig {
  critical: {
    max_allowed: number;      // 0 = block on any critical
    blocking: boolean;
  };
  high: {
    max_allowed: number;      // e.g., 5
    blocking: boolean;
  };
  medium: {
    max_allowed: number;      // e.g., 10
    blocking: boolean;
  };
  coverage_delta: {
    min_delta: number;        // e.g., -5 (allow 5% decrease)
    blocking: boolean;
  };
  automated_checks: {
    require_all_pass: boolean;
    blocking_checks: string[]; // e.g., ['linter', 'tests', 'security_scan']
  };
}

const DEFAULT_QUALITY_GATE: QualityGateConfig = {
  critical: { max_allowed: 0, blocking: true },
  high: { max_allowed: 5, blocking: true },
  medium: { max_allowed: 10, blocking: false },
  coverage_delta: { min_delta: -5, blocking: false },
  automated_checks: {
    require_all_pass: true,
    blocking_checks: ['tests', 'security_scan'],
  },
};

function applyQualityGate(
  report: ReviewReport,
  config: QualityGateConfig = DEFAULT_QUALITY_GATE
): QualityGateResult {
  const violations: string[] = [];
  let shouldBlock = false;

  // Check critical findings
  if (report.summary.critical > config.critical.max_allowed) {
    violations.push(
      `Critical findings: ${report.summary.critical} (max: ${config.critical.max_allowed})`
    );
    if (config.critical.blocking) shouldBlock = true;
  }

  // Check high findings
  if (report.summary.high > config.high.max_allowed) {
    violations.push(
      `High findings: ${report.summary.high} (max: ${config.high.max_allowed})`
    );
    if (config.high.blocking) shouldBlock = true;
  }

  // Check medium findings
  if (report.summary.medium > config.medium.max_allowed) {
    violations.push(
      `Medium findings: ${report.summary.medium} (max: ${config.medium.max_allowed})`
    );
    if (config.medium.blocking) shouldBlock = true;
  }

  // Check coverage delta
  const coverageDelta = report.automated_checks.tests?.coverage_delta?.lines || 0;
  if (coverageDelta < config.coverage_delta.min_delta) {
    violations.push(
      `Coverage decreased by ${Math.abs(coverageDelta)}% (max decrease: ${Math.abs(config.coverage_delta.min_delta)}%)`
    );
    if (config.coverage_delta.blocking) shouldBlock = true;
  }

  // Check automated checks
  for (const checkName of config.automated_checks.blocking_checks) {
    const check = report.automated_checks[checkName];
    if (check && check.status === 'failed') {
      violations.push(`${checkName} check failed`);
      if (config.automated_checks.require_all_pass) shouldBlock = true;
    }
  }

  return {
    passed: !shouldBlock,
    violations,
    recommendation: shouldBlock ? 'BLOCK_MERGE' : 'ALLOW_MERGE',
  };
}
```

### Exit Code Mapping

```typescript
function getPipelineExitCode(
  report: ReviewReport,
  qualityGate: QualityGateResult
): number {
  // Exit code 0: Success
  if (qualityGate.passed && report.summary.total_findings === 0) {
    return 0;
  }

  // Exit code 1: Quality gate failed (blocking)
  if (!qualityGate.passed) {
    return 1;
  }

  // Exit code 0 with warnings: Quality gate passed but findings exist
  if (qualityGate.passed && report.summary.total_findings > 0) {
    console.warn('⚠️  Review passed with warnings');
    return 0; // Non-blocking
  }

  return 0;
}
```

---

## Multi-Memory MCP in Automation

### Connection Setup

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function connectToMemoryMCP(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['path/to/multi-memory-mcp/build/index.js'],
    env: {
      MEMORY_STORAGE_PATH: process.env.MEMORY_STORAGE_PATH || './memory-db',
    },
  });

  const client = new Client(
    {
      name: 'pr-review-automation',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);
  return client;
}
```

### Loading Project Knowledge

```typescript
async function loadProjectKnowledge(mcpClient: Client): Promise<ProjectKnowledge> {
  // Load project rules
  const rulesResponse = await mcpClient.request(
    {
      method: 'tools/call',
      params: {
        name: 'query_entities',
        arguments: {
          entity_type: 'project_rule',
        },
      },
    },
    {}
  );

  const rules = JSON.parse(rulesResponse.content[0].text).entities;

  // Load hotspots
  const hotspotsResponse = await mcpClient.request(
    {
      method: 'tools/call',
      params: {
        name: 'query_entities',
        arguments: {
          entity_type: 'hotspot',
        },
      },
    },
    {}
  );

  const hotspots = JSON.parse(hotspotsResponse.content[0].text).entities;

  // Load common anti-patterns
  const antiPatternsResponse = await mcpClient.request(
    {
      method: 'tools/call',
      params: {
        name: 'query_entities',
        arguments: {
          entity_type: 'anti_pattern',
        },
      },
    },
    {}
  );

  const antiPatterns = JSON.parse(antiPatternsResponse.content[0].text).entities;

  return {
    rules,
    hotspots,
    antiPatterns,
  };
}
```

### Storing Review Learnings

```typescript
async function storeReviewLearnings(
  mcpClient: Client,
  findings: Finding[],
  context: ReviewContext
): Promise<void> {
  // Update hotspot metrics
  const fileIssues = new Map<string, number>();
  for (const finding of findings) {
    const count = fileIssues.get(finding.file) || 0;
    fileIssues.set(finding.file, count + 1);
  }

  for (const [file, issueCount] of fileIssues.entries()) {
    // Check if hotspot exists
    const existingHotspot = await queryHotspot(mcpClient, file);

    if (existingHotspot) {
      // Update existing hotspot
      await mcpClient.request(
        {
          method: 'tools/call',
          params: {
            name: 'update_entity',
            arguments: {
              entity_name: existingHotspot.name,
              updates: {
                issue_count: existingHotspot.observations.issue_count + issueCount,
                last_issue: new Date().toISOString(),
              },
            },
          },
        },
        {}
      );
    } else if (issueCount >= 3) {
      // Create new hotspot if multiple issues found
      await mcpClient.request(
        {
          method: 'tools/call',
          params: {
            name: 'create_entity',
            arguments: {
              name: `hotspot_${file.replace(/[^a-zA-Z0-9]/g, '_')}`,
              entity_type: 'hotspot',
              observations: {
                file_path: file,
                issue_count: issueCount,
                last_issue: new Date().toISOString(),
                note: `Identified as hotspot in PR review`,
              },
            },
          },
        },
        {}
      );
    }
  }

  // Store new anti-patterns if discovered
  for (const finding of findings) {
    if (finding.pattern_discovered && finding.severity in ['critical', 'high']) {
      await mcpClient.request(
        {
          method: 'tools/call',
          params: {
            name: 'create_entity',
            arguments: {
              name: `anti_pattern_${finding.id}`,
              entity_type: 'anti_pattern',
              observations: {
                pattern_name: finding.subcategory,
                description: finding.description,
                example_pr: context.branchName,
                file: finding.file,
                occurred_count: 1,
                fix: finding.recommended_fix?.description,
              },
            },
          },
        },
        {}
      );
    }
  }
}
```

### Knowledge Application Example

```typescript
async function applyProjectKnowledge(
  finding: RawFinding,
  knowledge: ProjectKnowledge
): Promise<Finding> {
  let enhancedFinding = { ...finding };

  // Check against project rules
  for (const rule of knowledge.rules) {
    if (matchesRule(finding, rule)) {
      enhancedFinding.rule_violated = rule.rule_id;
      enhancedFinding.rationale = rule.rationale;
      if (rule.examples) {
        enhancedFinding.reference_files = rule.examples;
      }
    }
  }

  // Check against known anti-patterns
  for (const pattern of knowledge.antiPatterns) {
    if (matchesAntiPattern(finding, pattern)) {
      enhancedFinding.anti_pattern_matched = pattern.pattern_name;
      enhancedFinding.occurrence_frequency = pattern.occurred_count;
      if (pattern.fix) {
        enhancedFinding.recommended_fix = {
          ...enhancedFinding.recommended_fix,
          description: pattern.fix,
        };
      }
    }
  }

  return classifyFinding(enhancedFinding);
}
```

---

## Example Implementations

### Example 1: Simple Pipeline Integration

```bash
#!/bin/bash
# scripts/run-pr-review.sh

set -e

echo "🔍 Starting automated PR review..."

# 1. Install dependencies
npm ci

# 2. Run automated checks
echo "Running linter..."
npm run lint --format json > lint-results.json || true

echo "Running tests with coverage..."
npm test -- --coverage --json > test-results.json || true

echo "Running security scan..."
semgrep --config auto --json > security-results.json || true

# 3. Run LLM review
echo "Running LLM-based code review..."
export SOURCE_BRANCH=${CI_SOURCE_BRANCH}
export TARGET_BRANCH=${CI_TARGET_BRANCH}
export PR_NUMBER=${CI_PR_NUMBER}
export WORKSPACE_PATH=${CI_WORKSPACE}

node scripts/review-automation.js

# 4. Check exit code
if [ $? -eq 0 ]; then
  echo "✅ Review passed"
  exit 0
else
  echo "❌ Review failed - blocking merge"
  exit 1
fi
```

### Example 2: Review Script with Agent Spawning

```typescript
// scripts/review-with-agents.ts
import Anthropic from '@anthropic-ai/sdk';

async function reviewWithAgents(
  files: PrioritizedFile[],
  knowledge: ProjectKnowledge
): Promise<Finding[]> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  // Group files for parallel review
  const groups = [
    { name: 'security', files: files.filter(f => isSecuritySensitive(f.path)) },
    { name: 'performance', files: files.filter(f => f.linesChanged > 100) },
    { name: 'tests', files: files.filter(f => f.path.includes('test')) },
  ];

  // Spawn agents in parallel
  const agentPromises = groups.map(group =>
    runAgentReview(anthropic, group, knowledge)
  );

  const results = await Promise.all(agentPromises);

  // Merge findings from all agents
  return results.flat();
}

async function runAgentReview(
  anthropic: Anthropic,
  group: FileGroup,
  knowledge: ProjectKnowledge
): Promise<Finding[]> {
  const prompt = buildReviewPrompt(group, knowledge);

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 16000,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  // Parse response and extract findings
  const findings = parseAgentResponse(message.content);
  return findings;
}

function buildReviewPrompt(
  group: FileGroup,
  knowledge: ProjectKnowledge
): string {
  return `
You are conducting a code review focusing on: ${group.name}

Project Rules:
${JSON.stringify(knowledge.rules, null, 2)}

Files to Review:
${group.files.map(f => `- ${f.path} (${f.linesChanged} lines changed)`).join('\n')}

For each file, analyze the changes and identify:
1. Security vulnerabilities (SQL injection, XSS, auth issues)
2. Performance problems (N+1 queries, memory leaks)
3. Error handling gaps
4. Testing gaps

Output your findings in JSON format:
{
  "findings": [
    {
      "severity": "critical|high|medium|low",
      "category": "security|performance|testing|architecture|code_quality",
      "subcategory": "specific_issue_type",
      "title": "Brief title",
      "description": "Detailed description",
      "file": "path/to/file",
      "line_start": 123,
      "line_end": 125,
      "code_snippet": "problematic code",
      "recommended_fix": {
        "description": "how to fix",
        "code_example": "fixed code"
      }
    }
  ]
}
`;
}
```

### Example 3: Quality Gate Configuration

```json
{
  "quality_gate": {
    "critical": {
      "max_allowed": 0,
      "blocking": true
    },
    "high": {
      "max_allowed": 3,
      "blocking": true
    },
    "medium": {
      "max_allowed": 10,
      "blocking": false
    },
    "coverage_delta": {
      "min_delta": -2,
      "blocking": true
    },
    "automated_checks": {
      "require_all_pass": true,
      "blocking_checks": [
        "linter",
        "type_check",
        "tests",
        "security_scan"
      ]
    }
  },
  "notifications": {
    "on_failure": {
      "channels": ["slack", "email"],
      "recipients": ["dev-team"]
    },
    "on_critical_findings": {
      "channels": ["slack"],
      "recipients": ["security-team", "tech-leads"]
    }
  },
  "review_strategy": {
    "small_pr_threshold": 10,
    "large_pr_threshold": 50,
    "use_multi_agent_when": "files > 50 OR security_sensitive_files > 5"
  }
}
```

### Example 4: Output Artifact Usage

```typescript
// scripts/process-review-report.ts
import fs from 'fs/promises';

async function processReviewReport(reportPath: string) {
  const report: ReviewReport = JSON.parse(
    await fs.readFile(reportPath, 'utf-8')
  );

  // 1. Generate markdown summary
  const summary = generateMarkdownSummary(report);
  await fs.writeFile('review-summary.md', summary);

  // 2. Generate SARIF for security findings (for IDE integration)
  const sarif = generateSARIF(report);
  await fs.writeFile('review-sarif.json', JSON.stringify(sarif, null, 2));

  // 3. Generate metrics for dashboard
  const metrics = extractMetrics(report);
  await fs.writeFile('review-metrics.json', JSON.stringify(metrics, null, 2));

  // 4. Generate actionable checklist
  const checklist = generateChecklist(report);
  await fs.writeFile('review-checklist.md', checklist);

  console.log('✅ Review artifacts generated:');
  console.log('  - review-summary.md');
  console.log('  - review-sarif.json');
  console.log('  - review-metrics.json');
  console.log('  - review-checklist.md');
}

function generateSARIF(report: ReviewReport): any {
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: {
          driver: {
            name: 'LLM PR Review',
            version: '1.0',
          },
        },
        results: report.findings.map(finding => ({
          ruleId: finding.id,
          level: mapSeverityToSARIF(finding.severity),
          message: {
            text: finding.description,
          },
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: finding.file,
                },
                region: {
                  startLine: finding.line_start,
                  endLine: finding.line_end,
                },
              },
            },
          ],
          fixes: finding.recommended_fix
            ? [
                {
                  description: {
                    text: finding.recommended_fix.description,
                  },
                },
              ]
            : [],
        })),
      },
    ],
  };
}

function mapSeverityToSARIF(severity: Severity): string {
  const map = {
    critical: 'error',
    high: 'error',
    medium: 'warning',
    low: 'note',
  };
  return map[severity];
}
```

---

## Conclusion

This automation approach provides:

1. **Structured Output** - Machine-readable JSON for integration
2. **Quality Gates** - Configurable blocking rules
3. **Multi-Agent Support** - Parallel review for large PRs
4. **Knowledge Persistence** - Learning via Multi-Memory MCP
5. **CI/CD Integration** - Ready for pipeline deployment
6. **Comprehensive Analysis** - Security, performance, testing, architecture
7. **Actionable Results** - Clear fixes and recommendations

The system continuously improves through Multi-Memory MCP, building institutional knowledge while maintaining consistent, thorough code review standards.
