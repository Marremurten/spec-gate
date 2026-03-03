---
name: check-diff
description: Validate git diff against the spec contract. Catches scope creep, missing implementation, decision violations, and feeds back to improve spec quality.
argument-hint: [base-branch]
disable-model-invocation: true
---

# Spec Gate — Gate 2: Diff Validation

You are checking the current git diff against the spec contract to detect **scope creep**, **missing implementation**, **decision violations**, and **spec quality gaps**. If a spec scored high on determinism but the implementation diverges, the spec criteria need to be improved — a 10/10 spec should produce identical output every time.

## Step 1: Load contract

Read `.spec-gate/contract.json`. If it doesn't exist:
- Run `git diff --stat` and report raw diff stats only
- Print: "No contract found. Run `/check-spec` first to generate a contract, or showing raw diff stats."
- Stop after printing stats.

Extract the `spec_type` field from the contract (defaults to `fullstack` if not present). You'll use this for type-aware decision verification in Step 3e and in the report header.

Also read `.spec-gate.json` for `ignoredPaths` configuration. If `.spec-gate.json` doesn't exist, use these defaults:
```
ignoredPaths: ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "*.snap", ".env*", "*.generated.*"]
```

If `.spec-gate/refined-spec.md` exists, read it too — you'll need it for acceptance criteria and decision verification.

Read `.spec-gate/learnings.json` if it exists — you'll append new learnings in Step 8.

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
- Filter out files matching `ignoredPaths` patterns from `.spec-gate.json`
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

### 3e: Decision verification
Extract technical decisions from the refined spec (the **Decisions** section) or the contract's `refined_spec` field. For each decision, verify it was followed in the actual diff.

Use the `spec_type` from the contract to focus on the right kind of decisions:

**Frontend decisions:**
- **Element/component choices** — e.g., "use `<section>` not `<div>`" → check the diff for the correct element
- **Styling choices** — e.g., "`text-2xl font-bold`" → check for exact className
- **Library choices** — e.g., "inline SVG in JSX" → check that an SVG element exists inline, not an `<img>` tag
- **Placement choices** — e.g., "replaces 'Job Finder' text" → check that the old text is removed and new element is in place

**Backend decisions:**
- **Library/package choices** — e.g., "use jose lib" → check if the diff imports `jose` (not `jsonwebtoken` or another lib)
- **Algorithm/pattern choices** — e.g., "RS256" → grep the diff for "RS256"
- **Status code choices** — e.g., "422 for validation" → check the diff for 422 status codes
- **Error format choices** — e.g., "`{error, details}`" → check response shaping in the diff

**Infra decisions:**
- **Provider/resource choices** — e.g., "use `ubuntu-latest`" → check workflow YAML
- **Config value choices** — e.g., "NODE_ENV=production" → check env/config files in diff
- **Networking choices** — e.g., "port 3000" → check for port configuration

**Data decisions:**
- **Column type choices** — e.g., "VARCHAR(255)" → check migration/schema diff
- **Constraint choices** — e.g., "ON DELETE CASCADE" → check for cascade rules in diff
- **Index choices** — e.g., "unique index on email" → check for index definitions

**General (all types):**
- **Naming conventions** — e.g., "httpOnly cookie" → check for `httpOnly: true` in the diff
- **Architecture choices** — verify structural patterns match the spec

For each decision, score: **✓ followed**, **✗ violated**, **? cannot verify from diff alone**

### 3f: Restricted path check
If `.spec-gate.json` defines `restrictedPaths`, check if any changed files match those patterns.

## Step 4: Score compliance

Calculate a compliance score based on 5 signals:

| Signal | Weight | Scoring |
|--------|--------|---------|
| **File accuracy** | 3 | 2 = all expected files present, no extras. 1 = expected files present but extras too. 0 = expected files missing. |
| **Boundary respect** | 1 | 2 = within both boundaries. 1 = one boundary exceeded. 0 = both exceeded. |
| **Acceptance criteria** | 3 | 2 = all criteria met (✓). 1 = some met, some unverifiable (?). 0 = any criteria not met (✗). |
| **Scope discipline** | 1 | 2 = zero scope creep candidates. 1 = 1-3 extras (minor). 0 = 4+ extras. |
| **Decision adherence** | 2 | 2 = all decisions followed (✓). 1 = some followed, some unverifiable (?). 0 = any decision violated (✗). |

Calculate: `compliance_score = round((raw_total / 20) * 10)` where `raw_total = sum of (score × weight)`, max raw = 20.

## Step 5: Print report

```
## Spec Gate — Diff Compliance Report

**Contract:** .spec-gate/contract.json
**Spec type:** <spec_type from contract, or "fullstack" if not present>
**Spec determinism score:** N/10
**Diff compliance score:** N/10
**Diff base:** <base branch, commit hash, or working tree>
**Files changed:** N (boundary: N) <✓ or ⚠ EXCEEDED>
**Lines added:** N (boundary: N) <✓ or ⚠ EXCEEDED>

### Compliance signals

| Signal | Score | Weight | Weighted | Assessment |
|--------|-------|--------|----------|------------|
| File accuracy | N/2 | ×3 | N/6 | <one-line reasoning> |
| Boundary respect | N/2 | ×1 | N/2 | <one-line reasoning> |
| Acceptance criteria | N/2 | ×3 | N/6 | <one-line reasoning> |
| Scope discipline | N/2 | ×1 | N/2 | <one-line reasoning> |
| Decision adherence | N/2 | ×2 | N/4 | <one-line reasoning> |

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

### Decision adherence

| Status | Decision | Evidence |
|--------|----------|----------|
| ✓ | Use jose lib | `import { SignJWT } from "jose"` found in diff |
| ✗ | RS256 algorithm | Diff uses `HS256` instead |
| ? | httpOnly cookie | Cookie setting not visible in diff |

### Summary
- **In contract:** N/N files
- **Missing:** N files <list if any>
- **Scope creep candidates:** N files <list if any>
- **Boundary violations:** <list if any>
- **Decision violations:** N <list if any>
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
| Decisions violated | **Decisions resolved** scored too high | Decisions were stated but not specific enough (e.g., "use good auth" vs "jose, RS256") |

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

Write the compliance results back to `.spec-gate/contract.json` by adding these fields:

```json
{
  "...existing fields...",
  "compliance": {
    "score": N,
    "signals": {
      "file_accuracy": N,
      "boundary_respect": N,
      "acceptance_criteria": N,
      "scope_discipline": N,
      "decision_adherence": N
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
    "decision_results": {
      "<decision text>": "followed|violated|unverifiable"
    },
    "adjusted_determinism_score": N
  }
}
```

## Step 8: Write learnings

This is what makes spec-gate self-improving across sessions. Update `.spec-gate/learnings.json` with what was learned from this compliance check.

### 8a: Extract lessons

For each compliance signal that scored below 2 (when the spec scored that signal at 2), create a lesson:

- **Unexpected files** → extract a **file coupling rule**: "When file X changes, file Y usually also needs to change"
  - Look at the scope creep files and the expected files. Is there a pattern? (e.g., changing a Prisma model always needs a migration, changing a route handler always needs a test update, changing a component always needs a CSS module update)
  - Express as: `trigger_file → also_requires` pattern

- **Boundaries exceeded** → extract a **size estimation rule**: "Changes to X tend to be larger than expected"
  - Note how much the boundary was exceeded by

- **Acceptance criteria missed** → extract a **criteria specificity rule**: "Criteria like 'X' are too vague to verify — need 'Y' instead"
  - Note what was vague and what would have been testable

- **Scope creep** → extract a **negative space rule**: "When doing X, agents also tend to do Y — explicitly exclude it"
  - Note what the agent did that wasn't asked for

- **Decisions violated** → extract a **decision specificity rule**: "Decision 'X' was too vague — agent interpreted it as 'Y' instead of 'Z'"
  - Note what the spec said vs what the agent actually did

### 8a-2: Extract implementation rules

**This is separate from lessons.** Lessons improve spec scoring. Implementation rules prevent the implementer from repeating the same mistakes.

For **every** decision violation or acceptance criteria failure, create a concrete implementation rule:

- **Format:** A short, actionable "do/don't" directive that an implementer can follow without any other context
- **Scope it** by spec type (frontend, backend, etc.) so only relevant rules surface
- **Be specific:** Bad: "Follow the spec." Good: "Use exact Tailwind utility classes from the spec — never substitute similar values (e.g., translate-x-0.5 instead of translate-x-0) for aesthetic reasons."
- **Include the violation** as context so the implementer understands WHY the rule exists

Examples:
- Decision violation `translate-x-0 → translate-x-0.5` → Rule: "Use exact CSS/Tailwind values from spec — never adjust for visual polish without spec approval"
- Criteria missed "Returns 401 on bad creds" → Rule: "Always implement error responses for every status code listed in the spec"
- Decision violation "Used HS256 instead of RS256" → Rule: "Use the exact algorithm/library specified — do not substitute alternatives even if functionally equivalent"

### 8a-3: Classify learnings

Classify each learning extracted in 8a and 8a-2 as `major` or `minor`:

**Major (auto-save without asking):**
- Decision violations (spec said X, code did Y)
- Acceptance criteria not met
- Missing expected files from the contract

**Minor (ask the user first):**
- Scope creep of 1-3 extra files
- Boundary slightly exceeded (< 50% over)
- New file coupling rule suggestions
- Scoring note adjustments

Tag each lesson, implementation rule, file coupling rule, and scoring note with its classification before proceeding to 8b and 8c.

### 8b: Build file coupling rules

File coupling rules are the most valuable learning. They capture project-specific patterns like:
- `prisma/schema.prisma` → `prisma/migrations/` (Prisma models need migrations)
- `src/app/api/*/route.ts` → `tests/api/*.test.ts` (API routes need test updates)
- `src/lib/schemas/*.ts` → `src/types/*.ts` (Zod schemas mirror TypeScript types)
- `src/app/layout.tsx` → `src/app/globals.css` (layout changes often need style changes)

To detect these, look at the scope creep files and check if they share a directory or naming pattern with the expected files.

### 8c-1: Auto-save major learnings

Read the existing `.spec-gate/learnings.json` (or start fresh if it doesn't exist). Write all learnings classified as `major` in Step 8a-3 directly — decision violations, criteria failures, and missing-file lessons do not need user approval.

### 8c-2: Present minor learnings for approval

If there are any learnings classified as `minor` in Step 8a-3, present them to the user using `AskUserQuestion` with `multiSelect: true`. Each option should clearly describe the learning so the user can make an informed choice.

Example:

```
Question: "Should spec-gate learn from these minor findings?"
Options (multiSelect: true):
- "File coupling: layout.tsx changes also need globals.css"
- "Scope creep: agent also touched utils/helpers.ts (not in spec)"
- "Boundary: 15 files changed vs 12 limit (25% over)"
```

If there are no minor learnings, skip the question entirely.

Only write user-approved minor learnings to `learnings.json`. Declined minor learnings are discarded.

### 8c-3: Write to learnings.json

Combine auto-saved major learnings and user-approved minor learnings, then append to the file:

```json
{
  "version": "1",
  "last_updated": "<ISO timestamp>",
  "entries": [
    {
      "date": "<ISO timestamp>",
      "spec_source": "<contract.created_from>",
      "spec_score": N,
      "compliance_score": N,
      "gap": N,
      "lessons": [
        {
          "signal": "file_boundaries",
          "spec_scored": 2,
          "should_have_been": 1,
          "description": "Spec listed src/app/layout.tsx but implementation also needed src/app/globals.css"
        }
      ]
    }
  ],
  "file_coupling_rules": [
    {
      "trigger": "prisma/schema.prisma",
      "also_requires": ["prisma/migrations/"],
      "description": "Prisma schema changes require a migration",
      "times_seen": 1,
      "first_seen": "<ISO>",
      "last_seen": "<ISO>"
    }
  ],
  "scoring_notes": [
    {
      "signal": "file_boundaries",
      "note": "This project has tightly coupled files — be stricter when scoring file boundaries",
      "times_over_scored": 1
    }
  ],
  "implementation_rules": [
    {
      "rule": "Use exact Tailwind utility classes from spec — never adjust values for visual polish",
      "category": "frontend",
      "severity": "high",
      "source_violation": "Spec said translate-x-0, implementer used translate-x-0.5",
      "times_violated": 1,
      "first_seen": "<ISO>",
      "last_seen": "<ISO>"
    }
  ]
}
```

**Rules for updating existing learnings:**
- If a `file_coupling_rules` entry with the same `trigger` already exists, increment `times_seen` and update `last_seen`
- If a `scoring_notes` entry for the same signal exists, increment `times_over_scored`
- If an `implementation_rules` entry with a semantically equivalent `rule` already exists, increment `times_violated` and update `last_seen`
- Never remove existing entries — only add or increment
- Keep `entries` as an append-only log (max 20 entries, drop oldest if exceeded)

### 8d: Print learnings summary

Distinguish between auto-saved and user-approved learnings in the output:

```
### Learnings saved

Auto-saved (major):
- N implementation rules added/reinforced
- N decision violations logged
- N acceptance criteria failures logged

User-approved (minor):
- N file coupling rules saved
- N scoring notes saved
- Skipped: N minor learnings (user declined)
```

If there were no minor learnings to ask about, omit the "User-approved" section entirely.

If no learnings were extracted (both scores high), print:

```
### Learnings
No new learnings — spec accurately predicted the implementation.
```

**Important:** This is always advisory. Never block the user. Present findings neutrally — scope creep candidates may be legitimate, and compliance gaps are learning opportunities, not failures.
