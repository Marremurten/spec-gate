---
name: check-determinism
description: Test if a spec truly produces identical output by running two independent implementations and comparing them. The ultimate determinism validation.
argument-hint: [path-to-spec-or-contract]
---

# Spec Gate — Determinism Test

You are running the ultimate validation: **does this spec actually produce identical output when given to two independent agents?** This tests the core premise of spec-gate — a 10/10 spec should yield the same code every time.

This is an expensive operation (two full implementations) so it's opt-in via `/check-determinism`.

## Step 1: Load the spec

Find the spec to test using this priority order:

1. If `$ARGUMENTS` is a file path → read that file
2. Read `.spec-gate/refined-spec.md` if it exists (preferred — already refined)
3. Read `.spec-gate/contract.json` and use the `refined_spec` field
4. Fall back to conversation context

If no spec is found, tell the user and stop.

Also read `.spec-gate/contract.json` if it exists — you'll compare the determinism score against actual results.

## Step 2: Confirm with user

This test will create two temporary worktrees and run independent implementations. Inform the user:

```
## Determinism Test

This will:
1. Create two isolated git worktrees
2. Run the spec through two independent agents (Agent A and Agent B)
3. Compare their outputs line-by-line
4. Report how deterministic the spec actually is

This takes a few minutes since it runs two full implementations.
```

Use AskUserQuestion:
- **"Run test"** — Proceed with the determinism test
- **"Cancel"** — Stop

## Step 3: Run two independent implementations

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

**Agent B prompt:** (identical)
```
You are implementing a spec. Follow it exactly — do not add anything beyond what is specified.

<spec>
{refined spec content}
</spec>

Implement this spec now. Only modify the files listed. Follow every decision exactly.
When done, list the files you changed.
```

**Critical:** Both agents must receive identical prompts. No additional context, no codebase hints, no learnings. The spec must stand on its own.

Launch both agents simultaneously using parallel Agent tool calls. Wait for both to complete.

## Step 4: Compare outputs

After both agents finish, compare their implementations:

### 4a: File-level comparison

Use the worktree paths returned by the Agent tool results to compare outputs. Run `git diff --name-only HEAD` in each agent's worktree path.

Compare the two file lists:
- **Identical files:** Both agents changed the same files
- **A-only files:** Agent A changed but B didn't
- **B-only files:** Agent B changed but A didn't

### 4b: Content comparison
For each file that both agents changed, run a diff between the two versions using the worktree paths from the Agent tool results:
```bash
diff <worktree-a-path>/<file> <worktree-b-path>/<file>
```

Categorize differences:
- **Identical lines:** Same code in both implementations
- **Cosmetic differences:** Whitespace, formatting, import order, comment style
- **Semantic differences:** Different logic, different libraries, different approaches
- **Naming differences:** Different variable/function names for the same concept

### 4c: Decision adherence per agent
For each decision in the spec, check if both agents followed it:
- Both followed → decision was specific enough
- One followed, one didn't → decision was ambiguous
- Neither followed → decision was ignored or unclear

## Step 5: Score determinism

Calculate an **actual determinism score** based on real results:

| Signal | Weight | Scoring |
|--------|--------|---------|
| **File overlap** | 3 | 2 = identical file lists. 1 = 80%+ overlap. 0 = < 80% overlap. |
| **Content similarity** | 3 | 2 = 90%+ identical lines (excluding cosmetic). 1 = 70-90%. 0 = < 70%. |
| **Decision consistency** | 2 | 2 = all decisions followed by both. 1 = some diverged. 0 = most diverged. |
| **Structural match** | 2 | 2 = same component structure/patterns. 1 = similar but different organization. 0 = fundamentally different approaches. |

Calculate: `actual_determinism = round((raw_total / 20) * 10)` where `raw_total = sum of (score × weight)`, max raw = 20.

## Step 6: Print report

```
## Spec Gate — Determinism Test Results

**Spec:** <path>
**Spec type:** <spec_type from contract, or "fullstack" if not present>
**Predicted determinism score:** N/10 (from /check-spec)
**Actual determinism score:** N/10 (from this test)
**Gap:** N points

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

## Step 7: Calibrate spec scoring

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

## Step 8: Write results and clean up

### 8a: Save results
Write results to `.spec-gate/determinism-test.json`:
```json
{
  "timestamp": "<ISO>",
  "spec_source": "<path>",
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

### 8b: Update learnings

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

### 8c: Clean up worktrees

If the Agent tool worktrees were not automatically cleaned up, remove them using the paths returned by the Agent tool results:
```bash
git worktree remove <worktree-a-path> --force
git worktree remove <worktree-b-path> --force
```

Print:
```
### Results saved
- Determinism test results: `.spec-gate/determinism-test.json`
- Learnings updated with N divergence patterns
- Worktrees cleaned up
```

**Important:** This is always advisory. A low actual determinism score doesn't mean the spec is bad — it means there's room to make it more specific. Some amount of implementation variance is natural and acceptable.
