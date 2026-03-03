---
name: check-spec
description: Validate an AI spec for determinism before implementation. Scores how consistently the spec would produce identical output across independent AI agents.
argument-hint: [path-to-spec-or-phase-number]
disable-model-invocation: true
---

# Spec Guard — Gate 1: Spec Determinism Check

You are validating a spec for **determinism** — how likely it is that two independent AI agents would produce identical output from this spec alone.

## Step 1: Resolve the spec

Find the spec to validate using this priority order:

1. If `$ARGUMENTS` is a file path that exists → read that file
2. If `$ARGUMENTS` is a number N → read `.planning/phase-N/PLAN.md`
3. If `$ARGUMENTS` is empty:
   a. Find the most recently modified `.planning/**/PLAN.md`
   b. Check `.spec-kit/` directory for spec files
   c. Fall back to conversation context (last plan discussed)
4. Check `.spec-guard.json` for custom `specSources` patterns

If no spec is found, tell the user and stop.

Use the Glob tool to search for files and the Read tool to read them. Read the full spec content before proceeding.

## Step 2: Detect workflow

Identify which workflow produced this spec:
- **GSD** → `.planning/phase-N/PLAN.md` format with tasks/waves
- **Plan mode** → Claude Code plan mode output
- **spec-kit** → `.spec-kit/` directory structure
- **Custom** → any other format

Record this for the contract.

## Step 3: Score 5 determinism signals

Evaluate each signal on a 0–2 scale:

| Signal | Weight | 0 = absent | 1 = vague | 2 = specific |
|--------|--------|------------|-----------|--------------|
| **Scope** | 3 | Not mentioned | "Add auth" | "Add JWT to POST /api/login returning {token}" |
| **File boundaries** | 2 | Not mentioned | "Update frontend" | Exact file paths listed |
| **Acceptance criteria** | 2 | Not mentioned | "Should work" | "Returns 200 with JWT body, 401 on bad creds" |
| **Negative space** | 2 | Not mentioned | "Keep simple" | "Out of scope: OAuth, refresh tokens, RBAC" |
| **Decisions resolved** | 1 | Not mentioned | "Use good approach" | "jose lib, RS256, 1hr expiry, httpOnly cookie" |

**Scoring rules:**
- Be strict. "Vague" means a human would need to make judgment calls.
- Score each signal independently.
- A signal at 0 means the spec literally does not address it.

Calculate: `determinism_score = round((raw_total / 20) * 10)` where `raw_total = sum of (score × weight)`, max raw = 20.

## Step 4: Generate diff contract

Create the directory `.spec-guard/` if it doesn't exist, then write `.spec-guard/contract.json`:

```json
{
  "version": "1",
  "created_from": "<path to the spec file>",
  "workflow": "<detected workflow from Step 2>",
  "timestamp": "<current ISO 8601 timestamp>",
  "expected_files": {
    "modify": ["<files the spec says to modify>"],
    "create": ["<files the spec says to create>"],
    "delete": ["<files the spec says to delete>"]
  },
  "boundaries": {
    "max_files_changed": "<count of all expected files + 3 buffer>",
    "max_lines_added": "<estimate based on scope, or default from .spec-guard.json>"
  },
  "acceptance_criteria": ["<extracted from spec>"],
  "determinism_score": "<score from Step 3>",
  "signals": {
    "scope": "<0-2>",
    "file_boundaries": "<0-2>",
    "acceptance_criteria": "<0-2>",
    "negative_space": "<0-2>",
    "decisions_resolved": "<0-2>"
  }
}
```

For `expected_files`: extract file paths mentioned in the spec. If the spec doesn't list files, leave arrays empty and note this reduced the file_boundaries score.

For `max_lines_added`: use the `boundaries.defaultMaxLinesAdded` from `.spec-guard.json` if it exists, otherwise default to 1000.

For `max_files_changed`: use the count of expected files + 3 as buffer, or `boundaries.defaultMaxFiles` from config, whichever is larger.

## Step 5: Print advisory report

Format your output as:

```
## Spec Guard — Determinism Report

**Spec:** <path>
**Workflow:** <detected workflow>
**Score:** <N>/10

| Signal | Score | Weight | Weighted | Assessment |
|--------|-------|--------|----------|------------|
| Scope | N/2 | ×3 | N/6 | <one-line reasoning> |
| File boundaries | N/2 | ×2 | N/4 | <one-line reasoning> |
| Acceptance criteria | N/2 | ×2 | N/4 | <one-line reasoning> |
| Negative space | N/2 | ×2 | N/4 | <one-line reasoning> |
| Decisions resolved | N/2 | ×1 | N/2 | <one-line reasoning> |

**Raw total:** N/20 → **Score: N/10**

### Suggestions to improve determinism
<only if score < 8, list specific improvements>

### Contract
Written to `.spec-guard/contract.json`
- Expected files: N modify, N create, N delete
- Boundaries: max N files, max N lines added
```

**Important:** This is always advisory. Never block the user or suggest they cannot proceed.
