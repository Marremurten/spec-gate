---
name: check-diff
description: Validate git diff against the spec contract. Catches scope creep, missing implementation, and feeds back to improve spec quality.
argument-hint: [base-branch]
disable-model-invocation: true
---

# Spec Guard — Gate 2: Diff Validation

You are checking the current git diff against the spec contract to detect **scope creep**, **missing implementation**, and **spec quality gaps**. If a spec scored high on determinism but the implementation diverges, the spec criteria need to be improved — a 10/10 spec should produce identical output every time.

## Step 1: Load contract

Read `.spec-guard/contract.json`. If it doesn't exist:
- Run `git diff --stat` and report raw diff stats only
- Print: "No contract found. Run `/check-spec` first to generate a contract, or showing raw diff stats."
- Stop after printing stats.

Also read `.spec-guard.json` for `ignoredPaths` configuration. If `.spec-guard.json` doesn't exist, use these defaults:
```
ignoredPaths: ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "*.snap", ".env*", "*.generated.*"]
```

If `.spec-guard/refined-spec.md` exists, read it too — you'll need it for acceptance criteria verification.

## Step 2: Get the diff

The goal is to capture only the changes related to this contract, not unrelated work that existed before.

### 2a: Determine the diff base

Use this priority order:

1. **Explicit base branch** — If `$ARGUMENTS` provides a base branch, use it:
   - `git diff $ARGUMENTS --stat` and `git diff $ARGUMENTS --name-only`

2. **Contract timestamp** — If no argument, use the contract's `timestamp` field to find the closest commit before the contract was created, then diff from that point. This filters out pre-existing changes:
   - Run: `git log --before="<contract.timestamp>" --format="%H" -1` to find the last commit before the contract
   - If a commit is found, use it as the base: `git diff <commit> --stat` and `git diff <commit> --name-only`
   - This captures commits made after the contract + any uncommitted work, but excludes changes that were already in the working tree before the contract was created

3. **Fallback** — If no commit is found before the timestamp (e.g., new repo):
   - `git diff --stat` and `git diff --name-only` (unstaged changes)
   - If no unstaged changes, try `git diff --cached --stat` and `git diff --cached --name-only` (staged changes)
   - If still nothing, try `git diff HEAD~1 --stat` and `git diff HEAD~1 --name-only` (last commit)

### 2b: Handle pre-existing uncommitted changes

The timestamp approach works well for commits, but cannot distinguish pre-existing uncommitted changes from new uncommitted changes. If the diff includes many files not in the contract, note this in the report:

> "Note: N files in the diff may be pre-existing uncommitted changes from before the contract was created. Consider committing or stashing unrelated work before running `/check-diff`."

Only show this note if there are more than 3 scope creep candidates.

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

### 3d: Acceptance criteria verification
For each criterion in the contract's `acceptance_criteria`:
- Read the actual diff content for the expected files (use `git diff <base> -- <file>` for each)
- Check if the diff evidence supports the criterion being met
- Score each criterion: **✓ met**, **✗ not met**, **? cannot verify from diff alone**

### 3e: Restricted path check
If `.spec-guard.json` defines `restrictedPaths`, check if any changed files match those patterns.

## Step 4: Score compliance

Calculate a compliance score based on 4 signals:

| Signal | Weight | Scoring |
|--------|--------|---------|
| **File accuracy** | 3 | 2 = all expected files present, no extras. 1 = expected files present but extras too. 0 = expected files missing. |
| **Boundary respect** | 2 | 2 = within both boundaries. 1 = one boundary exceeded. 0 = both exceeded. |
| **Acceptance criteria** | 3 | 2 = all criteria met (✓). 1 = some met, some unverifiable (?). 0 = any criteria not met (✗). |
| **Scope discipline** | 2 | 2 = zero scope creep candidates. 1 = 1-3 extras (minor). 0 = 4+ extras. |

Calculate: `compliance_score = round((raw_total / 20) * 10)` where `raw_total = sum of (score × weight)`, max raw = 20.

## Step 5: Print report

```
## Spec Guard — Diff Compliance Report

**Contract:** .spec-guard/contract.json
**Spec determinism score:** N/10
**Diff compliance score:** N/10
**Diff base:** <base branch, commit hash, or working tree>
**Files changed:** N (boundary: N) <✓ or ⚠ EXCEEDED>
**Lines added:** N (boundary: N) <✓ or ⚠ EXCEEDED>

### Compliance signals

| Signal | Score | Weight | Weighted | Assessment |
|--------|-------|--------|----------|------------|
| File accuracy | N/2 | ×3 | N/6 | <one-line reasoning> |
| Boundary respect | N/2 | ×2 | N/4 | <one-line reasoning> |
| Acceptance criteria | N/2 | ×3 | N/6 | <one-line reasoning> |
| Scope discipline | N/2 | ×2 | N/4 | <one-line reasoning> |

### File compliance

| Status | File | Expected | Actual |
|--------|------|----------|--------|
| ✓ | src/foo.ts | modify | modified |
| ✗ | src/bar.ts | create | missing |
| ⚠ | src/baz.ts | — | modified (scope creep) |

### Acceptance criteria

| Status | Criterion | Evidence |
|--------|-----------|----------|
| ✓ | The button is blue | `className="bg-blue-500"` found in diff |
| ✗ | Returns 401 on bad creds | No error handling in diff |
| ? | Visually balanced | Cannot verify from diff |

### Summary
- **In contract:** N/N files
- **Missing:** N files <list if any>
- **Scope creep candidates:** N files <list if any>
- **Boundary violations:** <list if any>
```

## Step 6: Spec quality feedback

This is the self-improving loop. Compare the two scores:

### If spec score was high (≥ 8) but compliance is low (< 8):

The spec scored well on determinism but the implementation still diverged. This means the **spec scoring was too generous** — something was under-specified. Diagnose which spec signals were wrong:

For each compliance signal that scored below 2, trace back to the spec signal that should have caught it:

| Compliance gap | Spec signal that failed | Diagnosis |
|----------------|------------------------|-----------|
| Unexpected files in diff | **File boundaries** scored too high | Spec listed files but missed dependencies/imports that needed updating |
| Boundaries exceeded | **Scope** scored too high | Spec described the change but underestimated its size |
| Acceptance criteria not met | **Acceptance criteria** scored too high | Criteria were present but not specific enough to be testable |
| Scope creep | **Negative space** scored too high | Spec had exclusions but missed adjacent concerns the agent addressed anyway |

Print a **Spec feedback** section:

```
### Spec feedback

**Spec determinism: N/10 → Diff compliance: N/10** (gap: N points)

The spec scored N/10 for determinism but implementation compliance was only N/10.
This means the spec was under-specified in these areas:

- **<signal>:** <what the spec said> → <what actually happened> → <what the spec should have said>
- **<signal>:** ...

These gaps suggest the spec's <signal> score should have been N/2 instead of N/2.
**Adjusted determinism score: N/10** (was N/10)
```

### If both scores are high (≥ 8):

The system is working as intended. Print:

```
### Spec feedback

**Spec determinism: N/10 → Diff compliance: N/10** ✓

The spec accurately predicted the implementation. No scoring adjustments needed.
```

### If spec score was low (< 8):

The spec was already flagged as under-specified. Compliance issues are expected. Print:

```
### Spec feedback

**Spec determinism: N/10 → Diff compliance: N/10**

The spec was already flagged as under-specified (N/10). Consider running `/check-spec` to refine it.
```

## Step 7: Update contract with results

Write the compliance results back to `.spec-guard/contract.json` by adding these fields:

```json
{
  "...existing fields...",
  "compliance": {
    "score": N,
    "signals": {
      "file_accuracy": N,
      "boundary_respect": N,
      "acceptance_criteria": N,
      "scope_discipline": N
    },
    "checked_at": "<ISO timestamp>",
    "diff_base": "<what was used as base>",
    "files_changed": N,
    "lines_added": N,
    "missing_files": ["..."],
    "scope_creep_files": ["..."],
    "criteria_results": {
      "<criterion text>": "met|not_met|unverifiable"
    },
    "adjusted_determinism_score": N
  }
}
```

Print:
```
### Results saved
Updated `.spec-guard/contract.json` with compliance results.
```

**Important:** This is always advisory. Never block the user. Present findings neutrally — scope creep candidates may be legitimate, and compliance gaps are learning opportunities, not failures.
