---
name: check-diff
description: Validate git diff against the spec contract. Catches scope creep and missing implementation.
argument-hint: [base-branch]
disable-model-invocation: true
---

# Spec Guard — Gate 2: Diff Validation

You are checking the current git diff against the spec contract to detect **scope creep** and **missing implementation**.

## Step 1: Load contract

Read `.spec-guard/contract.json`. If it doesn't exist:
- Run `git diff --stat` and report raw diff stats only
- Print: "No contract found. Run `/check-spec` first to generate a contract, or showing raw diff stats."
- Stop after printing stats.

Also read `.spec-guard.json` for `ignoredPaths` configuration. If `.spec-guard.json` doesn't exist, use these defaults:
```
ignoredPaths: ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "*.snap", ".env*", "*.generated.*"]
```

## Step 2: Get the diff

Run the appropriate git diff command using Bash:
- If `$ARGUMENTS` provides a base branch → `git diff $ARGUMENTS --stat` and `git diff $ARGUMENTS --name-only`
- Otherwise → `git diff --stat` and `git diff --name-only` (unstaged changes)
- If no unstaged changes, try `git diff --cached --stat` and `git diff --cached --name-only` (staged changes)
- If still nothing, try `git diff HEAD~1 --stat` and `git diff HEAD~1 --name-only` (last commit)

Collect the list of changed files and the overall stats (insertions/deletions).

## Step 3: Compare against contract

### 3a: Scope creep detection
Files in diff that are NOT in the contract's `expected_files` (any of modify/create/delete):
- Filter out files matching `ignoredPaths` patterns from `.spec-guard.json`
- Remaining files are **scope creep candidates**

### 3b: Missing implementation
Files in contract's `expected_files` that are NOT in the diff:
- These are files the spec expected to change but weren't touched
- Could indicate incomplete implementation

### 3c: Boundary checks
- Compare total files changed against `contract.boundaries.max_files_changed`
- Compare total lines added against `contract.boundaries.max_lines_added`
- Flag if either exceeds the boundary

### 3d: Restricted path check
If `.spec-guard.json` defines `restrictedPaths`, check if any changed files match those patterns.

## Step 4: Print advisory report

```
## Spec Guard — Diff Compliance Report

**Contract:** .spec-guard/contract.json (score: N/10)
**Diff base:** <base branch or working tree>
**Files changed:** N (boundary: N) <✓ or ⚠ EXCEEDED>
**Lines added:** N (boundary: N) <✓ or ⚠ EXCEEDED>

### Contract compliance

| Status | File | Expected | Actual |
|--------|------|----------|--------|
| ✓ | src/foo.ts | modify | modified |
| ✗ | src/bar.ts | create | missing |
| ⚠ | src/baz.ts | — | modified (scope creep) |

### Summary
- **In contract:** N/N files
- **Missing:** N files <list if any>
- **Scope creep candidates:** N files <list if any>
- **Boundary violations:** <list if any>

### Acceptance criteria
<list each criterion from contract with ✓/? status — mark ? if you cannot verify from diff alone>
```

**Important:** This is always advisory. Scope creep candidates are not necessarily wrong — the implementation may have legitimately needed those files. Present findings neutrally.
