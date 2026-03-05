---
name: check-determinism
description: Test if a spec truly produces identical output by comparing how two independent agents interpret it. Defaults to a fast outline-based comparison; use --full for real implementations.
argument-hint: [--full] [--demo] [path-to-spec-or-contract]
---

# Spec Gate — Determinism Test

You are testing whether a spec produces identical output when given to two independent agents. This tests the core premise of spec-gate — a 10/10 spec should yield the same code every time.

Run this **before implementing** to validate the spec itself, not your implementation.

## Step 1: Load the spec

Find the spec to test using this priority order:

1. If `$ARGUMENTS` contains a file path → read that file
2. Read `.spec-gate/refined-spec.md` if it exists (preferred — already refined)
3. Read `.spec-gate/contract.json` and use the `refined_spec` field
4. Fall back to conversation context

If no spec is found, tell the user and stop.

Also read `.spec-gate/contract.json` if it exists — you'll compare the determinism score against actual results.

## Step 2: Detect mode

Check `$ARGUMENTS` for flags:

- **`--full`** → Full mode (two real implementations in worktrees). Expensive but definitive.
- **`--demo`** → Light mode with outlines saved to `.spec-gate/` for inspection.
- **No flags** → Light mode (default). Two agents produce detailed outlines, no real code written. Fast and cheap.

`--demo` can be combined with `--full` — in that case, run full mode but also save the comparison artifacts.

## Step 3: Confirm with user

### Light mode (default)

```
## Determinism Test (light)

This will:
1. Ask two independent agents to produce detailed implementation outlines from the spec
2. Compare their planned file changes, decisions, imports, and structure
3. Report where they diverge — revealing ambiguity in the spec

Fast — no real code is written, just outlines.
```

### Full mode (`--full`)

```
## Determinism Test (full)

This will:
1. Create two isolated git worktrees
2. Run the spec through two independent agents (Agent A and Agent B)
3. Compare their actual code line-by-line
4. Report how deterministic the spec actually is

This takes a few minutes since it runs two full implementations.
```

Use AskUserQuestion:
- **"Run test"** — Proceed with the determinism test
- **"Cancel"** — Stop

---

## Light mode steps (default)

### Step 4L: Run two independent outline agents

Use the Agent tool to spawn **two agents in parallel**. Each agent gets the exact same prompt — the refined spec and nothing else. No additional context, no hints, no conversation history.

**Agent A prompt:**
```
You are planning an implementation from a spec. Do NOT write real code or modify any files. Instead, produce a detailed implementation outline.

<spec>
{refined spec content}
</spec>

For each file the spec says to modify or create, produce:

1. **File path**
2. **Imports** — exact package names and what you'd import
3. **Exports** — what the file exports (function names, types, constants)
4. **Key decisions** — for each technical decision in the spec, state exactly what you'd do
5. **Structure** — describe the functions/components/classes you'd create, their signatures, and how they connect
6. **Critical lines** — write out the 5-10 most decision-sensitive lines as real code (e.g., the config object, the route handler signature, the className string, the SQL query)

Be maximally specific. If the spec says "use jose with RS256", write the exact import and constructor call.
Do NOT write full implementations — just the outline with critical lines.
```

**Agent B prompt:** (identical to Agent A)

**Critical:** Both agents must receive identical prompts. No additional context, no codebase hints, no learnings. The spec must stand on its own.

Launch both agents simultaneously using parallel Agent tool calls. Wait for both to complete.

### Step 4L-demo: Save outlines (if `--demo`)

If `--demo` is set, write each agent's raw outline to a file so the user can inspect them:

- `.spec-gate/determinism-outline-a.md` — Agent A's full outline
- `.spec-gate/determinism-outline-b.md` — Agent B's full outline

These files are written before comparison so the user can review them even if something goes wrong in later steps.

### Step 5L: Compare outlines

After both agents finish, compare their outlines across these dimensions:

#### 5La: File list agreement
- **Identical files** — both agents listed the same files
- **A-only files** — Agent A would change but B wouldn't
- **B-only files** — Agent B would change but A wouldn't

#### 5Lb: Import/dependency agreement
For each shared file, compare the imports:
- Same package, same imports → agreement
- Same package, different imports → minor divergence
- Different packages entirely → major divergence (the spec's decision was ambiguous)

#### 5Lc: Structural agreement
For each shared file, compare the structure:
- Same function/component names and signatures → agreement
- Same structure, different naming → naming divergence
- Different structure entirely → major divergence

#### 5Ld: Critical line agreement
For each shared file, compare the critical code lines:
- Identical → the spec was specific enough for this decision
- Different values/config → the spec left this decision open
- Different approach entirely → the spec was ambiguous here

#### 5Le: Decision adherence
For each decision in the spec, check if both agents interpreted it the same way:
- Both agree → decision was specific enough
- They diverge → decision was ambiguous

### Step 6L: Score determinism

Calculate an **actual determinism score** based on outline comparison:

| Signal | Weight | Scoring |
|--------|--------|---------|
| **File overlap** | 3 | 2 = identical file lists. 1 = 80%+ overlap. 0 = < 80% overlap. |
| **Import agreement** | 2 | 2 = same packages and imports. 1 = same packages, different imports. 0 = different packages. |
| **Decision consistency** | 3 | 2 = all decisions interpreted identically. 1 = some diverged. 0 = most diverged. |
| **Structural match** | 2 | 2 = same structure/signatures. 1 = similar but different naming or organization. 0 = fundamentally different approaches. |

Calculate: `actual_determinism = round((raw_total / 20) * 10)` where `raw_total = sum of (score × weight)`, max raw = 20.

Skip to **Step 8** (print report).

---

## Full mode steps (`--full`)

### Step 4F: Run two independent implementations

Use the Agent tool to spawn **two agents in parallel**, each with `isolation: "worktree"` so they get their own isolated copy of the repository. Each agent gets the exact same prompt — the refined spec and nothing else. No additional context, no hints, no conversation history.

**Agent A prompt:**
```
You are implementing a spec. Follow it exactly — do not add anything beyond what is specified.

<spec>
{refined spec content}
</spec>

Implement this spec now. Only modify the files listed. Follow every decision exactly.
When done, list the files you changed.
```

**Agent B prompt:** (identical to Agent A)

**Critical:** Both agents must receive identical prompts. No additional context, no codebase hints, no learnings. The spec must stand on its own.

Launch both agents simultaneously using parallel Agent tool calls. Wait for both to complete.

### Step 4F-demo: Save worktree paths (if `--demo`)

If `--demo` is set, do NOT clean up the worktrees at the end (skip Step 10c). Instead, print the worktree paths so the user can inspect both implementations:

```
### Demo artifacts
Agent A worktree: <worktree-a-path>
Agent B worktree: <worktree-b-path>

Inspect with: diff <worktree-a-path>/src <worktree-b-path>/src
Clean up manually: git worktree remove <path> --force
```

### Step 5F: Compare outputs

After both agents finish, compare their implementations:

#### 5Fa: File-level comparison

Use the worktree paths returned by the Agent tool results to compare outputs. Run `git diff --name-only HEAD` in each agent's worktree path.

Compare the two file lists:
- **Identical files:** Both agents changed the same files
- **A-only files:** Agent A changed but B didn't
- **B-only files:** Agent B changed but A didn't

#### 5Fb: Content comparison
For each file that both agents changed, run a diff between the two versions using the worktree paths from the Agent tool results:
```bash
diff <worktree-a-path>/<file> <worktree-b-path>/<file>
```

Categorize differences:
- **Identical lines:** Same code in both implementations
- **Cosmetic differences:** Whitespace, formatting, import order, comment style
- **Semantic differences:** Different logic, different libraries, different approaches
- **Naming differences:** Different variable/function names for the same concept

#### 5Fc: Decision adherence per agent
For each decision in the spec, check if both agents followed it:
- Both followed → decision was specific enough
- One followed, one didn't → decision was ambiguous
- Neither followed → decision was ignored or unclear

### Step 6F: Score determinism

Calculate an **actual determinism score** based on real results:

| Signal | Weight | Scoring |
|--------|--------|---------|
| **File overlap** | 3 | 2 = identical file lists. 1 = 80%+ overlap. 0 = < 80% overlap. |
| **Content similarity** | 3 | 2 = 90%+ identical lines (excluding cosmetic). 1 = 70-90%. 0 = < 70%. |
| **Decision consistency** | 2 | 2 = all decisions followed by both. 1 = some diverged. 0 = most diverged. |
| **Structural match** | 2 | 2 = same component structure/patterns. 1 = similar but different organization. 0 = fundamentally different approaches. |

Calculate: `actual_determinism = round((raw_total / 20) * 10)` where `raw_total = sum of (score × weight)`, max raw = 20.

---

## Step 8: Print report

### Report header (both modes)

```
## Spec Gate — Determinism Test Results

**Spec:** <path>
**Spec type:** <spec_type from contract, or "fullstack" if not present>
**Mode:** <light or full>
**Predicted determinism score:** N/10 (from /check-spec)
**Actual determinism score:** N/10 (from this test)
**Gap:** N points
```

### Light mode report body

```
### File agreement
- Agent A plans to change: N files
- Agent B plans to change: N files
- Identical file lists: yes/no
- Overlap: N%

### Import agreement
For each shared file:

| File | Agent A imports | Agent B imports | Match |
|------|----------------|----------------|-------|
| src/foo.ts | jose, express | jose, express | ✓ |
| src/bar.ts | zod | yup | ✗ DIVERGED |

### Decision consistency

| Decision | Agent A interpretation | Agent B interpretation | Match |
|----------|----------------------|----------------------|-------|
| Use jose lib | jose with SignJWT | jose with SignJWT | ✓ |
| Error format | {error, details} | {errors: [...]} | ✗ DIVERGED |

### Critical line comparison
For each divergence, show the two agents' critical lines side-by-side:
- **<file>** — Agent A: `<code>` vs Agent B: `<code>`. The spec said "<what>" — this was ambiguous because...

### Spec improvement suggestions
Based on where the agents diverged, these spec additions would increase determinism:
- <specific addition that would resolve each divergence>
```

### Full mode report body

```
### File overlap
- Agent A changed: N files
- Agent B changed: N files
- Identical file lists: yes/no
- Overlap: N% (N files in common out of N total)

### Content similarity
For each shared file:

| File | Identical lines | Cosmetic diff | Semantic diff | Similarity |
|------|----------------|---------------|---------------|------------|
| src/foo.ts | N/N lines | N lines | N lines | N% |

**Overall content similarity:** N%

### Decision consistency

| Decision | Agent A | Agent B | Match |
|----------|---------|---------|-------|
| Use jose lib | ✓ followed | ✓ followed | ✓ |
| RS256 algorithm | ✓ followed | ✗ used HS256 | ✗ DIVERGED |

### Key divergences
<For each semantic difference, explain what diverged and why:>
- **<file>:<line>** — Agent A did X, Agent B did Y. The spec said Z but this was ambiguous because...

### Spec improvement suggestions
Based on where the agents diverged, these spec additions would increase determinism:
- <specific addition that would resolve each divergence>
```

## Step 9: Calibrate spec scoring

Compare the predicted score (from `/check-spec`) against the actual score:

### If predicted ≈ actual (within 1 point):
Scoring is well-calibrated. No action needed.

### If predicted > actual (spec scored higher than reality):
The spec scoring was too generous. Identify which signals were over-scored:
- If agents used different files → file_boundaries was over-scored
- If agents made different decisions → decisions_resolved was over-scored
- If agents structured code differently → scope was over-scored

### If predicted < actual (spec scored lower than reality):
The spec scoring was too strict (rare but possible). The spec produced more consistent results than expected.

Print:
```
### Scoring calibration

**Predicted: N/10 → Actual: N/10**
<assessment of calibration quality>
<which signals were mis-scored and why>
```

## Step 10: Write results and clean up

### 10a: Save results
Write results to `.spec-gate/determinism-test.json`:
```json
{
  "timestamp": "<ISO>",
  "spec_source": "<path>",
  "mode": "light|full",
  "predicted_score": N,
  "actual_score": N,
  "gap": N,
  "file_overlap_pct": N,
  "content_similarity_pct": N,
  "divergences": [
    {
      "file": "<path>",
      "type": "semantic|cosmetic|naming",
      "description": "<what diverged>",
      "spec_gap": "<what the spec should have said>"
    }
  ]
}
```

### 10b: Update learnings

Divergence patterns from real agent behavior are the most valuable learnings — they prove exactly where specs fail. Read `.spec-gate/learnings.json` (or start fresh if it doesn't exist) and append new data.

#### What to extract from divergences

For each **semantic divergence** (not cosmetic), create a learning entry:

- **Different files touched** → extract a **file coupling rule**: if one agent changed file X but the other didn't, the spec's file boundaries were ambiguous
- **Different libraries/imports** → extract a **decision specificity rule**: "Decision 'use auth middleware' was too vague — Agent A used `express-rate-limit`, Agent B used custom middleware"
- **Different structure/patterns** → extract a **scope specificity rule**: "Spec said 'add error handling' but didn't specify the pattern — Agent A used try/catch, Agent B used error middleware"
- **Different naming** → extract a **naming rule**: "Spec didn't specify variable/function names — Agent A used `rateLimiter`, Agent B used `throttle`"

#### Write to learnings.json

Append a new entry to the `entries` array:

```json
{
  "date": "<ISO timestamp>",
  "spec_source": "<path>",
  "spec_score": "<predicted score>",
  "compliance_score": "<actual determinism score>",
  "gap": "<predicted - actual>",
  "source": "determinism_test",
  "mode": "light|full",
  "lessons": [
    {
      "signal": "decisions_resolved",
      "spec_scored": 2,
      "should_have_been": 1,
      "description": "Spec said 'add rate limiting' but agents chose different libraries (express-rate-limit vs custom). Needs: 'use express-rate-limit with windowMs: 60000, max: 100'"
    }
  ]
}
```

Also update `scoring_notes` if the predicted score was significantly higher than actual (gap >= 2):

```json
{
  "signal": "<over-scored signal>",
  "note": "Determinism test showed <signal> was over-scored — agents diverged on <what>",
  "times_over_scored": 1
}
```

**Rules for updating existing learnings:**
- If a `scoring_notes` entry for the same signal exists, increment `times_over_scored`
- Keep `entries` as an append-only log (max 20, drop oldest if exceeded)
- Mark entries from determinism tests with `"source": "determinism_test"` so `/check-spec` can distinguish them from `/check-diff` learnings

### 10c: Clean up (full mode only, skip if `--demo`)

If `--demo` is set, skip cleanup — the user wants to inspect the worktrees manually.

Otherwise, if the Agent tool worktrees were not automatically cleaned up, remove them using the paths returned by the Agent tool results:
```bash
git worktree remove <worktree-a-path> --force
git worktree remove <worktree-b-path> --force
```

### 10d: Print summary

```
### Results saved
- Determinism test results: `.spec-gate/determinism-test.json`
- Learnings updated with N divergence patterns
<if full mode and not --demo: "- Worktrees cleaned up">
<if --demo and light mode: "- Agent outlines saved to .spec-gate/determinism-outline-a.md and .spec-gate/determinism-outline-b.md">
<if --demo and full mode: "- Worktrees preserved for inspection (clean up manually with git worktree remove)">
```

**Important:** This is always advisory. A low actual determinism score doesn't mean the spec is bad — it means there's room to make it more specific. Some amount of implementation variance is natural and acceptable.
