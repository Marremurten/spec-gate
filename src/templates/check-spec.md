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

## Step 3: Detect workflow

Identify which workflow produced this spec:
- **GSD** → `.planning/phase-N/PLAN.md` format with tasks/waves
- **Plan mode** → Claude Code plan mode output
- **spec-kit** → `.spec-kit/` directory structure
- **Raw prompt** → a short instruction without structure
- **Custom** → any other format

Record this for the contract.

## Step 4: Score 5 determinism signals

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

## Step 5: Branch based on score

### If score >= 8: Generate contract directly

Skip to **Step 7** (generate contract) using the spec as-is. Print the report from **Step 6** first.

### If score < 8: Interactive refinement

**Do NOT just list suggestions. Ask the user targeted questions to fill the gaps.**

For each signal that scored below 2, generate 1-2 specific questions informed by the codebase context you gathered in Step 2. Questions must be:

- **Concrete, not abstract.** Bad: "What files should change?" Good: "The nav bar is in `src/app/layout.tsx`. Should the logo go to the left of the 'Job Finder' text link on line 21, or replace it entirely?"
- **Offer options when possible.** Use the AskUserQuestion tool with concrete choices derived from the codebase. For example, if the user says "add a logo", offer: "SVG inline in the component" vs "Image file in /public/" vs "Use next/image with an asset".
- **Scoped to what's missing.** Don't ask about signals that already scored 2.

Ask all questions in a **single AskUserQuestion call** (up to 4 questions). Group related signals if needed to stay within the limit. Make the options specific to the actual codebase — reference real file paths, existing patterns, and component names.

After the user answers, proceed to **Step 6**.

## Step 6: Synthesize refined spec

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
```

Then **re-score** the refined spec using the same 5 signals. Print both scores:

```
**Original score:** N/10 → **Refined score:** N/10
```

If the refined score is still < 8, note which signals remain weak but proceed anyway — don't loop forever.

## Step 7: Print report

Format your output as:

```
## Spec Guard — Determinism Report

**Spec:** <path or "conversation context">
**Workflow:** <detected workflow>
**Score:** <N>/10 <if refined: "(refined from N/10)">

| Signal | Score | Weight | Weighted | Assessment |
|--------|-------|--------|----------|------------|
| Scope | N/2 | ×3 | N/6 | <one-line reasoning> |
| File boundaries | N/2 | ×2 | N/4 | <one-line reasoning> |
| Acceptance criteria | N/2 | ×2 | N/4 | <one-line reasoning> |
| Negative space | N/2 | ×2 | N/4 | <one-line reasoning> |
| Decisions resolved | N/2 | ×1 | N/2 | <one-line reasoning> |

**Raw total:** N/20 → **Score: N/10**
```

## Step 8: Generate contract

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
  }
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
```

## Step 9: Handoff to implementation

After printing the contract summary, ask the user what to do next:

Use AskUserQuestion with these options:

- **"Implement now"** — Proceed immediately. Use the refined spec (or original if no refinement) as your implementation guide. Follow the file boundaries, acceptance criteria, and decisions exactly. After implementation, suggest the user run `/check-diff` to validate.
- **"Show spec to copy"** — Print the refined spec as a clean markdown block the user can copy and use as a prompt in a new session or with another tool.
- **"Done for now"** — Stop. The contract is saved and the user can implement later or in a new session. Remind them the contract is at `.spec-guard/contract.json` and they can run `/check-diff` after implementing.

If the user chose "Implement now":
1. Implement the changes described in the refined spec, following file boundaries strictly
2. Only touch files listed in `expected_files`
3. After implementation, print: `Spec Guard: Implementation complete. Run /check-diff to validate.`

**Important:** This is always advisory. Never block the user or suggest they cannot proceed. If they want to skip refinement, that's fine — generate the contract from whatever information is available.
