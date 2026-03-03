---
name: check-determinism
description: Test if a spec truly produces identical output by running two independent implementations and comparing them. The ultimate determinism validation.
argument-hint: [path-to-spec-or-contract]
---

# Spec Guard — Determinism Test

You are running the ultimate validation: **does this spec actually produce identical output when given to two independent agents?** This tests the core premise of spec-guard — a 10/10 spec should yield the same code every time.

This is an expensive operation (two full implementations) so it's opt-in via `/check-determinism`.

## Step 1: Load the spec

Find the spec to test using this priority order:

1. If `$ARGUMENTS` is a file path → read that file
2. Read `.spec-guard/refined-spec.md` if it exists (preferred — already refined)
3. Read `.spec-guard/contract.json` and use the `refined_spec` field
4. Fall back to conversation context

If no spec is found, tell the user and stop.

Also read `.spec-guard/contract.json` if it exists — you'll compare the determinism score against actual results.

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

## Step 3: Create worktrees and run implementations

### 3a: Create two isolated worktrees

Use Bash to create two git worktrees:
```bash
git worktree add .spec-guard/worktree-a -b spec-guard-test-a
git worktree add .spec-guard/worktree-b -b spec-guard-test-b
```

### 3b: Run two independent implementations

Use the Agent tool to spawn **two agents in parallel**, each in their own worktree with `isolation: "worktree"`. Each agent gets the exact same prompt — the refined spec and nothing else. No additional context, no hints, no conversation history.

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
```bash
# Get list of files changed by each agent
cd .spec-guard/worktree-a && git diff --name-only HEAD
cd .spec-guard/worktree-b && git diff --name-only HEAD
```

Compare the two file lists:
- **Identical files:** Both agents changed the same files
- **A-only files:** Agent A changed but B didn't
- **B-only files:** Agent B changed but A didn't

### 4b: Content comparison
For each file that both agents changed, run a diff between the two versions:
```bash
diff .spec-guard/worktree-a/<file> .spec-guard/worktree-b/<file>
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
## Spec Guard — Determinism Test Results

**Spec:** <path>
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
Write results to `.spec-guard/determinism-test.json`:
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
Append divergence patterns to `.spec-guard/learnings.json` as decision specificity rules — these are the most valuable learnings since they come from actual agent behavior, not just diff analysis.

### 8c: Clean up worktrees
```bash
git worktree remove .spec-guard/worktree-a --force
git worktree remove .spec-guard/worktree-b --force
git branch -D spec-guard-test-a spec-guard-test-b
```

Print:
```
### Results saved
- Determinism test results: `.spec-guard/determinism-test.json`
- Learnings updated with N divergence patterns
- Worktrees cleaned up
```

**Important:** This is always advisory. A low actual determinism score doesn't mean the spec is bad — it means there's room to make it more specific. Some amount of implementation variance is natural and acceptable.
