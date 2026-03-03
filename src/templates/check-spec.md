---
name: check-spec
description: Validate an AI spec for determinism before implementation. Scores how consistently the spec would produce identical output across independent AI agents. If the score is low, interactively refines the spec with the user.
argument-hint: [path-to-spec-or-phase-number]
---

# Spec Guard — Gate 1: Spec Determinism Check

You are validating a spec for **determinism** — how likely it is that two independent AI agents would produce identical output from this spec alone. If the score is low, you will help the user refine it.

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

## Step 2: Gather codebase context

Before scoring, understand the relevant parts of the codebase so you can ask informed questions later:

- Use Glob and Grep to find files related to the spec's topic
- Read the most relevant files (layout files, components, routes, etc.)
- Note existing patterns, naming conventions, and architecture decisions

Keep this context for Step 5 (refinement questions). Do NOT output this research to the user.

## Step 3: Load learnings from previous sessions

Read `.spec-guard/learnings.json` if it exists. This file contains lessons learned from previous `/check-diff` runs — patterns where specs scored high but implementations diverged.

Extract three things:

### 3a: File coupling rules
These are project-specific patterns like "changing X also requires changing Y". When scoring file boundaries in Step 4, check if the spec mentions a trigger file but misses its coupled files.

For example, if learnings contain:
```json
{ "trigger": "prisma/schema.prisma", "also_requires": ["prisma/migrations/"], "times_seen": 3 }
```
And the spec says "Modify: prisma/schema.prisma" but doesn't mention migrations → the file boundaries signal cannot score 2.

### 3b: Scoring notes
If a signal has been over-scored multiple times, apply stricter scoring. For example, if `file_boundaries` has `times_over_scored: 3`, require more explicit file listings to score a 2 — vague references like "and related files" should score 0 instead of 1.

### 3c: Past lessons
Review the lessons log for patterns relevant to the current spec. If previous specs in the same area (same files, same domain) had compliance issues, proactively flag them during refinement.

### 3d: Project checklist

If learnings have 3+ entries, generate a project-specific checklist of things specs for this project should always address. Build it from:
- File coupling rules → "Specs that touch X should also list Y"
- Recurring scoring notes → "This project often under-specifies Z"
- Past criteria failures → "Acceptance criteria should include test for W"

Store this checklist internally. In Step 6 (refinement), if the spec is missing items from the checklist, include them as pre-filled suggestions in the questions.

**Do NOT output learnings or the checklist to the user during this step.** Use them silently to inform scoring and refinement questions.

## Step 4: Detect workflow

Identify which workflow produced this spec:
- **GSD** → `.planning/phase-N/PLAN.md` format with tasks/waves
- **Plan mode** → Claude Code plan mode output (detailed plan with steps, usually written to a plan file)
- **spec-kit** → `.spec-kit/` directory structure
- **Raw prompt** → a short instruction without structure
- **Custom** → any other format

Record this for the contract.

## Step 5: Score 5 determinism signals

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

**Apply learnings during scoring:**
- **File boundaries:** If the spec lists files but learnings have file coupling rules for those files, check if the coupled files are also listed. If not, cap the score at 1 and note why.
- **Negative space:** If learnings show that agents tend to scope-creep in certain areas for similar specs, require explicit exclusions for those areas to score 2.
- **Scope:** If learnings show that similar changes tend to be larger than expected, require more detailed scope description to score 2.

If learnings affected any score, note it in the assessment column: "Scored 1/2 (learnings: prisma changes require migrations, not listed)"

Calculate: `determinism_score = round((raw_total / 20) * 10)` where `raw_total = sum of (score × weight)`, max raw = 20.

## Step 6: Branch based on score

### If score >= 8: Generate contract directly

Skip to **Step 8** (print report) using the spec as-is.

### If score < 8: Interactive refinement

**Do NOT just list suggestions. Ask the user targeted questions to fill the gaps.**

For each signal that scored below 2, generate 1-2 specific questions informed by the codebase context you gathered in Step 2 **and the learnings from Step 3**. Questions must be:

- **Concrete, not abstract.** Bad: "What files should change?" Good: "The nav bar is in `src/app/layout.tsx`. Should the logo go to the left of the 'Job Finder' text link on line 21, or replace it entirely?"
- **Offer options when possible.** Use the AskUserQuestion tool with concrete choices derived from the codebase. For example, if the user says "add a logo", offer: "SVG inline in the component" vs "Image file in /public/" vs "Use next/image with an asset".
- **Scoped to what's missing.** Don't ask about signals that already scored 2.
- **Informed by learnings.** If learnings flagged a file coupling rule (e.g., "changing schema.prisma also needs migrations"), include this in the question: "Past changes to `prisma/schema.prisma` also required a migration file. Should this spec include a migration?"

Ask all questions in a **single AskUserQuestion call** (up to 4 questions). Group related signals if needed to stay within the limit. Make the options specific to the actual codebase — reference real file paths, existing patterns, and component names.

After the user answers, proceed to **Step 7**.

## Step 7: Synthesize refined spec

Using the original spec plus the user's answers, produce a **refined spec block**. Format it as:

```
### Refined spec

**Task:** <one-line summary>

**Scope:**
- <specific changes, with file paths>

**Files:**
- Modify: <list>
- Create: <list>
- Delete: <list>

**Acceptance criteria:**
- <specific, testable criteria>

**Out of scope:**
- <explicit exclusions>

**Decisions:**
- <resolved technical choices>

**Suggested tests:**
- <test cases derived from acceptance criteria — each criterion that can be verified programmatically becomes a test>
```

### Generate test suggestions

For each acceptance criterion, determine if it can be expressed as an automated test:
- "Returns 200 with JWT body" → `test("POST /api/login returns 200 with token", ...)`
- "The icon has aria-label" → `test("logo link has aria-label", ...)`
- "Visually balanced" → skip (visual, not automatable)

Include only automatable criteria. Format as describe/it blocks with the testing framework used in the project (detect from package.json — vitest, jest, playwright, etc.). These go into the refined spec and the contract so check-diff can verify test coverage.

Then **re-score** the refined spec using the same 5 signals (with learnings applied). Print both scores:

```
**Original score:** N/10 → **Refined score:** N/10
```

If the refined score is still < 8, note which signals remain weak but proceed anyway — don't loop forever.

### Save the refined spec to disk

Write the refined spec to `.spec-guard/refined-spec.md` so it persists across sessions and can be used as input for plan mode or other workflows. This file is the source of truth for what was agreed upon.

## Step 8: Print report

Format your output as:

```
## Spec Guard — Determinism Report

**Spec:** <path or "conversation context">
**Workflow:** <detected workflow>
**Score:** <N>/10 <if refined: "(refined from N/10)">
<if learnings applied: "**Learnings applied:** N rules from N previous sessions">

| Signal | Score | Weight | Weighted | Assessment |
|--------|-------|--------|----------|------------|
| Scope | N/2 | ×3 | N/6 | <one-line reasoning> |
| File boundaries | N/2 | ×2 | N/4 | <one-line reasoning, include learnings note if applicable> |
| Acceptance criteria | N/2 | ×2 | N/4 | <one-line reasoning> |
| Negative space | N/2 | ×2 | N/4 | <one-line reasoning> |
| Decisions resolved | N/2 | ×1 | N/2 | <one-line reasoning> |

**Raw total:** N/20 → **Score: N/10**
```

## Step 9: Generate contract

Create the directory `.spec-guard/` if it doesn't exist, then write `.spec-guard/contract.json`:

```json
{
  "version": "1",
  "created_from": "<path to spec file, or 'conversation context (refined)'>",
  "workflow": "<detected workflow>",
  "timestamp": "<current ISO 8601 timestamp>",
  "refined_from_score": "<original score, only if refinement happened>",
  "refined_spec": "<the full refined spec text, only if refinement happened>",
  "expected_files": {
    "modify": ["<files from refined spec>"],
    "create": ["<files from refined spec>"],
    "delete": ["<files from refined spec>"]
  },
  "boundaries": {
    "max_files_changed": "<count of all expected files + 3 buffer>",
    "max_lines_added": "<estimate based on scope, or default from .spec-guard.json>"
  },
  "acceptance_criteria": ["<from refined spec>"],
  "determinism_score": "<final score>",
  "signals": {
    "scope": "<0-2>",
    "file_boundaries": "<0-2>",
    "acceptance_criteria": "<0-2>",
    "negative_space": "<0-2>",
    "decisions_resolved": "<0-2>"
  },
  "learnings_applied": "<number of rules applied, or 0>",
  "suggested_tests": ["<test descriptions from refined spec>"]
}
```

For `expected_files`: use the refined spec's file list. If refinement didn't happen, extract from the original spec.

For `max_lines_added`: use `boundaries.defaultMaxLinesAdded` from `.spec-guard.json` if it exists, otherwise default to 1000.

For `max_files_changed`: use count of expected files + 3 as buffer, or `boundaries.defaultMaxFiles` from config, whichever is larger.

Print:
```
### Contract
Written to `.spec-guard/contract.json`
- Expected files: N modify, N create, N delete
- Boundaries: max N files, max N lines added
- Acceptance criteria: N items
- Learnings applied: N rules
```

## Step 10: Handoff — what to do next

After printing the contract summary, ask the user how they want to proceed.

Use AskUserQuestion with these options:

- **"Implement now"** — Proceed to implement immediately using the refined spec as your guide. Follow the file boundaries, acceptance criteria, and decisions exactly. Only touch files listed in `expected_files`. After implementation, print: `Spec Guard: Implementation complete. Run /check-diff to validate.`
- **"Plan first, then implement"** — Enter plan mode to design a detailed implementation approach based on the refined spec. Read `.spec-guard/refined-spec.md` as the requirements. The plan should respect the file boundaries and acceptance criteria from the contract. After the plan is approved and implemented, suggest `/check-diff`.
- **"Done for now"** — Stop. Remind the user:
  - Refined spec saved to `.spec-guard/refined-spec.md`
  - Contract saved to `.spec-guard/contract.json`
  - To implement later: "Implement the spec in `.spec-guard/refined-spec.md`" or start a new session and reference the file
  - After implementing, run `/check-diff` to validate

### Plan mode integration notes

When the user chooses "Plan first, then implement":
1. Call the EnterPlanMode tool to switch to plan mode
2. In plan mode, use the refined spec from `.spec-guard/refined-spec.md` as the requirements — do NOT re-ask the questions that were already resolved during refinement
3. The plan should add implementation detail (component structure, exact code patterns, ordering) but must stay within the boundaries and scope of the refined spec
4. If the plan needs to expand beyond the contract boundaries (e.g., touching additional files), note this explicitly so the contract can be updated before implementation
5. After the user approves the plan and implementation completes, suggest `/check-diff`

When `/check-spec` is run on an existing plan (e.g., `/check-spec ./some-plan.md`):
- Score the plan like any other spec — plans from plan mode usually score 7-9/10
- If score >= 8, generate the contract directly with no refinement needed
- If score < 8, the refinement questions focus on what the plan is missing (usually negative space or acceptance criteria)

**Important:** This is always advisory. Never block the user or suggest they cannot proceed. If they want to skip refinement, that's fine — generate the contract from whatever information is available.
