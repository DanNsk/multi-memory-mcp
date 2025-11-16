# LLM Agent-Based PR Review Guide

## Overview

This document outlines a comprehensive approach for conducting thorough pull request reviews using LLM agents with a 200k token context limit, focusing on Git-based workflows without GitHub MCP dependency.

---

## Table of Contents

1. [General PR Review Workflow](#general-pr-review-workflow)
2. [Token Budget Management](#token-budget-management)
3. [Large File Handling Strategies](#large-file-handling-strategies)
4. [Agent Spawning Patterns](#agent-spawning-patterns)
5. [Multi-Memory MCP Integration](#multi-memory-mcp-integration)
6. [Practical Examples](#practical-examples)

---

## General PR Review Workflow

### Phase 1: Context Gathering

**Objective:** Understand the scope and nature of changes with minimal token usage.

```bash
# 1. Check current repository state
git status
git branch -a

# 2. Fetch the feature branch
git fetch origin <feature-branch>

# 3. Get statistical overview (lightweight)
git diff --stat <base-branch>...<feature-branch>
git diff --numstat <base-branch>...<feature-branch>

# 4. Get commit history
git log <base-branch>..<feature-branch> --oneline

# 5. Identify changed files
git diff --name-only <base-branch>...<feature-branch>
```

**Gather from user:**
- Feature branch name
- Base branch (main/master/develop)
- PR description or linked ticket
- Specific areas of concern
- Priority focus (security, performance, architecture)

### Phase 2: File Prioritization

**Categorize changed files by priority:**

```
Priority 1 (Critical - Deep Review):
├─ Security-sensitive: auth/*, payment/*, api/endpoints/*
├─ Core business logic
└─ Files with >100 lines changed

Priority 2 (Important - Thorough Review):
├─ Supporting utilities and helpers
├─ Database models and migrations
└─ Test files

Priority 3 (Quick Scan):
├─ Configuration files (package.json, tsconfig.json)
├─ Documentation (README.md, docs/*)
└─ Files with <20 lines changed

Priority 4 (Ignore):
├─ Generated files (dist/*, build/*, *.min.js)
├─ Lock files (package-lock.json, yarn.lock)
└─ Binary files
```

**Filter out noise:**

```bash
# Exclude generated and vendor files
git diff <base>...<feature> -- . \
  ':(exclude)dist/*' \
  ':(exclude)node_modules/*' \
  ':(exclude)*.lock' \
  ':(exclude)*.min.js' \
  ':(exclude)build/*'
```

### Phase 3: Automated Analysis

**Run automated checks before deep review:**

```bash
# Linting
npm run lint || eslint . || yarn lint

# Type checking
npm run type-check || tsc --noEmit

# Tests
npm test -- --coverage

# Build verification
npm run build

# Security scanning
npm audit || yarn audit
git secrets --scan  # if available

# Code complexity (if available)
npx eslint . --ext .js,.ts --format json > lint-report.json
```

**Track results:**
- Linting errors/warnings
- Type errors
- Test failures
- Build issues
- Security vulnerabilities

### Phase 4: Deep Code Review

**For each priority file, analyze:**

#### Security Review
```
✓ SQL injection risks (user input in queries?)
✓ XSS vulnerabilities (unescaped HTML output?)
✓ Authentication/authorization checks
✓ Secrets or credentials in code
✓ Input validation and sanitization
✓ CSRF protection
✓ Rate limiting
```

#### Architecture Review
```
✓ Fits existing patterns?
✓ Appropriate abstraction level?
✓ Reuses existing utilities?
✓ Avoids circular dependencies?
✓ Clear separation of concerns?
✓ SOLID principles followed?
```

#### Performance Review
```
✓ N+1 query problems
✓ Unnecessary loops or iterations
✓ Memory leaks (event listeners, timers)
✓ Database query efficiency
✓ Caching opportunities
✓ Algorithm complexity
```

#### Testing Review
```
✓ Edge cases covered?
✓ Error cases tested?
✓ Mock/stub usage appropriate?
✓ Test quality (not just coverage)
✓ Integration test implications
✓ Flaky test risks
```

#### Code Quality Review
```
✓ Clear naming conventions
✓ Function size (too large?)
✓ Code duplication
✓ Error handling completeness
✓ Comments/documentation
✓ Consistent style
```

### Phase 5: Contextual Analysis

```bash
# Check file history for context
git blame <file-path>

# Find related changes
git log --all --grep="<keyword>" --oneline

# Check for sensitive patterns
git diff <base>...<feature> | grep -i "password\|token\|secret\|api_key"

# Find all references to modified functions
grep -r "functionName" . --include="*.js" --include="*.ts"

# Check test coverage for changes
find . -name "*.test.js" -o -name "*.spec.ts"
```

### Phase 6: Review Report Generation

**Structured output format:**

```markdown
## PR Review: [branch-name]

### 📊 Summary
- Files changed: X
- Lines added/removed: +X / -X
- Commits: X
- Test coverage: [Status]

### ⚠️ Critical Issues (Must Fix)
1. [Issue with severity, location, fix suggestion]

### 🔍 Suggested Improvements
1. [Improvement with rationale]

### ✅ Good Practices Observed
- [Positive observations]

### 🧪 Test Analysis
- Unit tests: [Status]
- Edge cases: [Status]
- Error handling: [Status]

### 📦 Dependencies
- New dependencies: [List or "None"]
- Security vulnerabilities: [Status]

### 🎯 Files Needing Updates
- Documentation
- Related tests
- Configuration

### 🚦 Recommendation
[APPROVE | REQUEST CHANGES | COMMENT]
```

---

## Token Budget Management

### Budget Allocation (200k Token Limit)

```
Conversation & System:     ~20-30k tokens
Tool Results & Diffs:      ~50-100k tokens
File Contents:             ~50-100k tokens
Safety Buffer:             ~20k tokens
```

### Token Cost Estimates

```
Command output (git diff --stat):       ~1k tokens
Diff of single file (100 lines):       ~8k tokens
Full file read (500 lines):            ~40k tokens
Full file read (2000 lines):           ~160k tokens
Automated tool output (linter):        ~5-15k tokens
```

### Budget Strategy

**1. Lightweight Commands First**
```bash
# Cheap operations
git diff --stat              # ~1k tokens
git diff --name-only         # ~500 tokens
git log --oneline            # ~2k tokens

# Before expensive operations
git diff                     # Can be 50k+ tokens
```

**2. Progressive Depth**
```
Level 1: Statistics only (1k tokens)
Level 2: Diff review (10k tokens)
Level 3: Targeted file reading (30k tokens)
Level 4: Full file context (100k tokens) - only if necessary
```

**3. Smart Filtering**
```bash
# Review only specific file types
git diff <base>...<feature> -- "*.ts" "*.js"

# Review specific directories
git diff <base>...<feature> -- src/ tests/

# Exclude patterns
git diff <base>...<feature> -- . ':(exclude)*.test.ts'
```

---

## Large File Handling Strategies

### Strategy 1: Diff-First Reading (Recommended)

**For files >500 lines, read diff only:**

```bash
# Get only changes (minimal tokens)
git diff <base>...<feature> <large-file>

# With function context
git diff -W <base>...<feature> <large-file>

# With extended context (±10 lines)
git diff -U10 <base>...<feature> <large-file>
```

**Token savings:**
- Full file (2000 lines): ~160k tokens ❌
- Diff only (50 changed lines): ~4k tokens ✅

### Strategy 2: Targeted Extraction

**Extract specific sections based on diff:**

```bash
# Find changed function in diff
git diff <base>...<feature> <file> | grep "^[+\-].*function"

# Extract specific function with context
grep -A 100 "function targetFunction" <file>

# Extract specific line ranges
sed -n '450,550p' <file>  # Lines 450-550

# Get function boundaries
awk '/^function targetFunc/,/^}/' <file>
```

### Strategy 3: Multi-Pass Review

**Pass 1: Quick scan (diff only)**
```bash
git diff <base>...<feature> <file>
# Identify: What changed? Obvious issues?
```

**Pass 2: Focused context (if needed)**
```bash
# Read 50 lines around changes
sed -n '430,480p' <file>  # If change at line 455
```

**Pass 3: Full context (rare, critical only)**
```bash
# Only for security-critical files
Read <file>
```

### Strategy 4: Pattern-Based Scanning

**For security review without full read:**

```bash
# Security patterns in diff
git diff <base>...<feature> <file> | \
  grep -E "(password|token|secret|eval\(|innerHTML)"

# SQL injection patterns
git diff <base>...<feature> <file> | \
  grep -E "(\${.*}|query\(|execute\(|rawQuery)"

# Common issues
git diff <base>...<feature> <file> | \
  grep -E "(console\.log|debugger|TODO|FIXME|XXX)"
```

### Strategy 5: Chunk-Based Reading

**For very large files with multiple change locations:**

```typescript
// Pseudocode approach
changes = [
  { start: 450, end: 470 },   // Change 1
  { start: 1200, end: 1250 }, // Change 2
  { start: 3400, end: 3420 }  // Change 3
]

for (const change of changes) {
  // Read with ±20 line context
  chunk = readLines(change.start - 20, change.end + 20)
  reviewChunk(chunk)
}

// Token usage: 3 × 60 lines ≈ 14k tokens
// vs. full 5000 lines ≈ 400k tokens
```

### Decision Matrix: When to Read Full vs. Diff

| Scenario | Approach | Rationale |
|----------|----------|-----------|
| File <200 lines | Read full file | Minimal token cost |
| File 200-1000 lines, <50 changes | Read diff + targeted extracts | Balanced approach |
| File >1000 lines | Diff only + pattern scan | Token efficient |
| Security-critical file (any size) | Read full file | Risk justifies cost |
| Generated file | Skip entirely | No value |
| Test file >500 lines | Read diff only | Tests are self-documenting |
| Config file (any size) | Read full file | Usually small, needs context |

---

## Agent Spawning Patterns

### When Agent Spawning Helps

**✅ Use Case 1: Wide PR (Many Files)**

Distribute files across agents:

```
PR with 60 files:
├─ Agent 1: Backend changes (src/api/*, src/services/*) - 20 files
├─ Agent 2: Frontend changes (src/components/*, src/pages/*) - 25 files
├─ Agent 3: Database layer (src/models/*, migrations/*) - 10 files
└─ Agent 4: Tests and config (tests/*, *.config.js) - 5 files

Effective capacity: 4 × 200k = 800k tokens
```

**✅ Use Case 2: Multi-Concern Review**

Same files, different analytical lenses:

```
20 files, multiple perspectives:
├─ Agent 1: Security review
│   Focus: SQL injection, XSS, auth, secrets
│   Reads: Only security-relevant sections
│
├─ Agent 2: Performance review
│   Focus: N+1 queries, memory leaks, algorithms
│   Reads: Only performance-critical sections
│
├─ Agent 3: Test coverage
│   Focus: Edge cases, error handling, mocks
│   Reads: Test files + tested code
│
└─ Agent 4: Architecture review
    Focus: Patterns, dependencies, SOLID
    Reads: Module structure, imports, exports
```

**✅ Use Case 3: Monorepo**

Separate by package/module:

```
Monorepo PR:
├─ Agent 1: @company/auth package
├─ Agent 2: @company/payments package
├─ Agent 3: @company/notifications package
└─ Agent 4: Shared libraries (@company/utils)
```

### When Agent Spawning Doesn't Help

**❌ Single Large File**

```
One 5000-line file:
├─ Main agent: 200k limit ❌
└─ Spawned agent: 200k limit ❌ (Same problem!)

Solution: Use diff-first or targeted extraction instead
```

**❌ Sequential Dependencies**

```
If Agent 2 needs results from Agent 1:
└─ No parallelization benefit
└─ Use sequential single-agent approach
```

### Agent Task Design

**Good task decomposition:**

```typescript
// Clear, independent, bounded
Task 1: "Review src/auth/* for security vulnerabilities"
Task 2: "Review tests/auth/* for coverage of edge cases"
Task 3: "Review src/payment/* for SQL injection risks"

// Each agent:
// - Has clear scope
// - Independent from others
// - Produces structured findings
```

**Poor task decomposition:**

```typescript
// Too vague, overlapping, unbounded
Task 1: "Review everything for issues" ❌
Task 2: "Check if code is good" ❌
Task 3: "Look at whatever Agent 1 found" ❌ (dependent)
```

---

## Multi-Memory MCP Integration

### Purpose

Multi-Memory MCP provides persistent knowledge storage across reviews, enabling:
- Learning from past issues
- Enforcing project-specific rules
- Tracking codebase hotspots
- Building institutional knowledge

### What to Store

#### 1. Project-Specific Rules

```json
{
  "entity_type": "project_rule",
  "rule_id": "db_migrations",
  "rule": "All database migrations must include rollback scripts",
  "rationale": "Production incident 2025-01",
  "examples": ["migrations/20250115_add_user_table.ts"]
}
```

```json
{
  "entity_type": "project_rule",
  "rule_id": "auth_validation",
  "rule": "Always use authHelper.validateJWT() instead of manual verification",
  "file_path": "src/utils/authHelper.ts",
  "anti_pattern": "jwt.verify() called directly"
}
```

#### 2. Codebase Hotspots

```json
{
  "entity_type": "hotspot",
  "module": "auth",
  "file_path": "src/auth/jwt.ts",
  "issue_count": 8,
  "last_issue": "2025-01-15",
  "common_issues": [
    "Token expiration edge cases",
    "Refresh token race conditions"
  ],
  "review_note": "Extra scrutiny required - frequent bug source"
}
```

```json
{
  "entity_type": "hotspot",
  "module": "payment",
  "severity": "critical",
  "note": "Any changes require security team review",
  "escalation": "security@company.com"
}
```

#### 3. Common Patterns & Anti-Patterns

```json
{
  "entity_type": "anti_pattern",
  "pattern_name": "unhandled_async_errors",
  "description": "Async database calls without try/catch in transaction blocks",
  "example_pr": "feature/payment-refactor",
  "file": "src/payment/processor.ts:45",
  "occurred_count": 12,
  "fix": "Wrap all async calls in try/catch with transaction rollback"
}
```

```json
{
  "entity_type": "good_pattern",
  "pattern_name": "api_error_handling",
  "description": "Consistent error response format",
  "template": "{ success: false, error: { code, message, details } }",
  "example_file": "src/api/base-controller.ts"
}
```

#### 4. File-Specific Context

```json
{
  "entity_type": "file_context",
  "file_path": "src/auth/permissions.ts",
  "history": "Refactored 2025-01, was src/legacy/acl.js",
  "migration_note": "Uses new permission system, old ACL deprecated",
  "related_adr": "docs/adr/005-permission-model.md"
}
```

#### 5. Review Learnings (Team-Wide)

```json
{
  "entity_type": "review_learning",
  "learning": "API endpoint changes often miss OpenAPI spec updates",
  "frequency": "high",
  "checklist_item": "When adding/modifying endpoints, update docs/openapi.yaml"
}
```

```json
{
  "entity_type": "review_learning",
  "learning": "Database index changes need load testing",
  "context": "Production slowdown incident 2025-01-10",
  "requirement": "Run EXPLAIN ANALYZE on affected queries"
}
```

### Memory Operations in Review Workflow

#### Before Review: Retrieve Context

```typescript
// Get project rules
const projectRules = await memory.search({
  entity_type: "project_rule"
})

// Get hotspots for changed files
const changedFiles = getChangedFiles()
const hotspots = await memory.search({
  entity_type: "hotspot",
  file_path: { in: changedFiles }
})

// Get relevant anti-patterns
const antiPatterns = await memory.search({
  entity_type: "anti_pattern",
  occurred_count: { gte: 5 }  // Common issues
})

// Check file context
const fileContexts = await memory.search({
  entity_type: "file_context",
  file_path: { in: changedFiles }
})
```

#### During Review: Apply Knowledge

```typescript
// Check against project rules
for (const rule of projectRules) {
  if (violatesRule(diff, rule)) {
    findings.push({
      severity: "high",
      type: "rule_violation",
      rule: rule.rule,
      rationale: rule.rationale
    })
  }
}

// Extra scrutiny for hotspots
for (const hotspot of hotspots) {
  findings.push({
    type: "warning",
    message: `This file is a known hotspot: ${hotspot.note}`,
    common_issues: hotspot.common_issues
  })
}

// Pattern matching
for (const antiPattern of antiPatterns) {
  if (matchesPattern(diff, antiPattern)) {
    findings.push({
      severity: "medium",
      type: "anti_pattern",
      pattern: antiPattern.pattern_name,
      fix: antiPattern.fix
    })
  }
}
```

#### After Review: Store Learnings

```typescript
// Store new patterns discovered
if (foundNewAntiPattern) {
  await memory.create({
    entity_type: "anti_pattern",
    pattern_name: "new_pattern_name",
    description: "...",
    example_pr: currentBranch,
    file: fileWithIssue,
    occurred_count: 1,
    fix: "..."
  })
}

// Update hotspot metrics
if (issueInKnownHotspot) {
  const hotspot = await memory.get(hotspotId)
  await memory.update(hotspotId, {
    issue_count: hotspot.issue_count + 1,
    last_issue: new Date().toISOString()
  })
}

// Add new learnings
if (commonMistakeFound) {
  await memory.create({
    entity_type: "review_learning",
    learning: "...",
    frequency: "medium",
    checklist_item: "..."
  })
}
```

### Knowledge Evolution

**Growing smarter over time:**

```
Review 1: Find issue → Store as anti-pattern
Review 5: Same issue → Increment counter, flag as "common"
Review 10: Very common → Add to automatic checklist
Review 20: Pattern recognized → Proactive detection

Result: System learns project-specific failure modes
```

### Privacy-Respecting Approach

**Focus on code/project, NOT individuals:**

```
✅ Store: "auth module has 8 bugs in 6 months"
❌ Store: "Developer X wrote 8 bugs"

✅ Store: "This type of async pattern caused issues in PR #234"
❌ Store: "This developer makes async mistakes"

✅ Store: "Team often forgets to update docs with API changes"
❌ Store: "Developer Y never writes documentation"
```

---

## Practical Examples

### Example 1: Small PR (10 files, <500 lines total)

**Approach: Full comprehensive review**

```bash
# 1. Get diff (5k tokens)
git diff --stat main...feature/add-logging
git diff main...feature/add-logging

# 2. Read all changed files (30k tokens)
Read src/logger.ts
Read src/api/controller.ts
Read tests/logger.test.ts
# ... (7 more files)

# 3. Run automated checks (10k tokens)
npm run lint
npm test

# 4. Deep review (40k tokens)
# - Check each file thoroughly
# - Verify tests
# - Check dependencies

# 5. Generate report (5k tokens)

Total: ~90k tokens (plenty of room)
```

### Example 2: Medium PR (30 files, 2000 lines)

**Approach: Prioritized review**

```bash
# 1. Triage (5k tokens)
git diff --stat main...feature/refactor-auth
# Identify: 5 critical files, 20 small changes, 5 test files

# 2. Automated checks (15k tokens)
npm run lint
npm test
npm audit

# 3. Priority 1: Critical files - Full read (60k tokens)
Read src/auth/jwt.ts              # 400 lines
Read src/auth/permissions.ts      # 350 lines
Read src/middleware/auth.ts       # 200 lines
Read src/api/auth-controller.ts   # 300 lines
Read tests/auth.test.ts           # 500 lines

# 4. Priority 2: Small changes - Diff only (20k tokens)
git diff main...feature -- src/utils/
git diff main...feature -- src/config/

# 5. Check dependencies (10k tokens)
grep -r "jwt\." src/
grep -r "permissions\." src/

# 6. Generate report (10k tokens)

Total: ~120k tokens
```

### Example 3: Large PR (50+ files, 5000+ lines)

**Approach: Agent delegation**

```bash
# Main agent: Orchestration (20k tokens)
git diff --stat main...feature/major-refactor
# Analysis: Too large for single review

# Spawn 4 agents in parallel:

# Agent 1: Backend services (50k tokens)
Task: "Review src/services/* for security and performance"
Files: 15 files in services directory

# Agent 2: API layer (50k tokens)
Task: "Review src/api/* for breaking changes and error handling"
Files: 12 files in API directory

# Agent 3: Data layer (40k tokens)
Task: "Review src/models/* and migrations/* for data integrity"
Files: 10 files in data layer

# Agent 4: Tests (40k tokens)
Task: "Review all test files for coverage of new functionality"
Files: 20 test files

# Main agent: Aggregate (30k tokens)
# - Collect findings from all agents
# - Identify cross-cutting concerns
# - Generate unified report

Total effective capacity: ~230k tokens (via parallelization)
```

### Example 4: Single Large File (3000 lines)

**Approach: Diff-first + targeted extraction**

```bash
# 1. Get diff only (10k tokens)
git diff main...feature src/massive-controller.ts
# Analysis: Changes in 3 functions (lines 450, 1200, 2400)

# 2. Pattern scan for security (2k tokens)
git diff main...feature src/massive-controller.ts | \
  grep -E "(password|token|sql|query)"

# 3. Extract changed functions (25k tokens)
grep -A 60 "function processPayment" src/massive-controller.ts
grep -A 40 "function validateUser" src/massive-controller.ts
grep -A 50 "function sendNotification" src/massive-controller.ts

# 4. Check function dependencies (5k tokens)
grep -r "processPayment\|validateUser\|sendNotification" src/

# 5. Review test coverage (15k tokens)
grep -A 80 "describe.*processPayment" tests/controller.test.ts

# 6. Generate findings (8k tokens)

Total: ~65k tokens (vs 240k for full file read)
```

### Example 5: Multi-Concern Review

**Approach: Specialized agents for different concerns**

```bash
# Same 20 files, different analytical perspectives

# Agent 1: Security Review (60k tokens)
Focus areas:
- Authentication/authorization
- Input validation
- SQL injection, XSS
- Secrets in code
- CSRF protection

Reads: Only security-relevant code sections

# Agent 2: Performance Review (60k tokens)
Focus areas:
- Database query efficiency
- N+1 problems
- Memory leaks
- Algorithm complexity
- Caching opportunities

Reads: Only performance-critical code sections

# Agent 3: Architecture Review (50k tokens)
Focus areas:
- SOLID principles
- Design patterns
- Code organization
- Dependencies
- Module coupling

Reads: Module structure, imports, public APIs

# Agent 4: Test Quality Review (50k tokens)
Focus areas:
- Test coverage
- Edge cases
- Error scenarios
- Mock appropriateness
- Test maintainability

Reads: Test files + tested code interfaces

# Main agent: Synthesis (30k tokens)
Aggregate findings, resolve conflicts, final recommendation
```

---

## Review Checklist

### Pre-Review Setup
- [ ] Identify base and feature branches
- [ ] Get PR description and linked issues
- [ ] Understand priority focus areas
- [ ] Check for any project-specific requirements

### Automated Checks
- [ ] Run linters (eslint, prettier, etc.)
- [ ] Run type checker (TypeScript, Flow, etc.)
- [ ] Execute test suite
- [ ] Check test coverage
- [ ] Run security scanners (npm audit, Semgrep)
- [ ] Verify build succeeds

### Code Review
- [ ] Review changes for security vulnerabilities
- [ ] Check error handling completeness
- [ ] Verify input validation
- [ ] Assess performance implications
- [ ] Check for code duplication
- [ ] Verify naming conventions
- [ ] Review architecture alignment
- [ ] Check for breaking changes

### Testing Review
- [ ] Verify new code has tests
- [ ] Check edge cases are covered
- [ ] Verify error cases are tested
- [ ] Review test quality and maintainability
- [ ] Check for test flakiness risks

### Dependencies & Impact
- [ ] Review new dependencies
- [ ] Check for security vulnerabilities
- [ ] Identify files that depend on changes
- [ ] Verify dependent code still works
- [ ] Check if documentation needs updates

### Knowledge Management
- [ ] Store new patterns in Memory MCP
- [ ] Update hotspot metrics
- [ ] Add project-specific learnings
- [ ] Document anti-patterns found

### Final Steps
- [ ] Generate structured review report
- [ ] Provide clear, actionable feedback
- [ ] Make approval/change request recommendation
- [ ] Highlight critical vs. optional changes

---

## Conclusion

Effective LLM-based PR review requires:

1. **Strategic token management** - Prioritize high-value analysis
2. **Smart file handling** - Diff-first approach for large files
3. **Parallel processing** - Agent delegation for wide reviews
4. **Knowledge persistence** - Multi-Memory MCP for continuous improvement
5. **Comprehensive analysis** - Beyond diffs: security, performance, architecture
6. **Automated augmentation** - Leverage tools for consistent checks
7. **Clear communication** - Structured, actionable feedback

By combining these techniques, LLM agents can provide thorough, consistent code reviews that improve over time while respecting token budget constraints.
