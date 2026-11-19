---
name: vibe-ui
description: Publish every long answer for the user (report, plan, design review, comparison, analysis, answer with tables or decisions) as a local commentable document at http://localhost:7743/<slug> instead of a wall of text. The user selects passages, comments and ticks choices; you answer in the thread and edit the block, and each edit becomes a version. Trigger: any long deliverable, a decision with options, "/vibe-ui", "publish it so I can comment".
---

# Vibe Rich UI: a document the user answers by selecting and ticking

Use it whenever your answer is longer than a screen, has a table, or asks the user to decide something. The terminal gets one line with the link; the conversation happens on the page.

## Publish

1. Write a well-structured `.md` (in the project folder when it belongs to the project, otherwise in a scratch folder).
2. Publish it: `vibe-ui publish <slug> <file.md>` (short slug, lowercase letters and hyphens), or the MCP tool `publish`. `--force` recreates the document and drops its history: only when the user asks.
3. Open `http://localhost:7743/<slug>` (MCP tool `open`) and write one line in the terminal with the link. Nothing else.
4. Keep `vibe-ui wait 3500` running in the background. When it returns, handle what arrived and start it again.

If the server is not running, start it with `vibe-ui serve` in the background.

## Decisions are things to tick

Right under a `### D1: question` heading, write the options as a list:

- `- ( ) option` single choice, `- (*) option` pre-selected
- `- [ ] option` multiple choice, `- [x] option` pre-selected
- `- {off} option` on/off switch, `- {on} option` pre-selected

Pre-select your recommendation and say why in the option text (`(recommended): reason`). One question per heading, options short and parallel. The user can press **Approve decisions** to accept every question they did not touch, so a pre-selected option must be one you would really act on. `vibe-ui choices <slug>` shows the state of every question; each tick also arrives in `pending` as a message like `D1: question → option`.

## Answer comments

- `vibe-ui pending` lists every thread waiting for you: the selected passage, the request, the quoted message, pasted images (read the image file before answering) and the current text of the block.
- A question: `vibe-ui reply <comment> "<answer>"`, short, with numbers and sources. For a long answer write a file and pass `@file.md` (light markdown renders in the bubble). `--quote <messageId>` quotes a message of the thread.
- A change: `vibe-ui edit <slug> <block> @new.md --comment <comment> --reason "<what changed>"`. The edit replaces the whole block, so rewrite it coherently. If the change affects other blocks, edit them too.
- Several changes from one comment: edit each block (with `--comment` on the main one) and send ONE reply at the end listing what changed and where.
- A new block: `vibe-ui insert <slug> <afterBlock> @new.md`. Remove: `vibe-ui remove <slug> <block>` (hides it; the history keeps it).
- A tick on a choice card usually needs no reply: act on it, or reply only when the choice changes the plan.
- Never resolve a thread yourself. The user does.

## Writing the markdown

- First line `# Title`, then one sentence with the conclusion.
- `> ` for the summary and other callouts; one `## ` per section, each opening with its answer.
- Tables to compare; lists only for parallel items; short sentences.
- Charts: a ```chart block with a Chart.js config in JSON (add `"maintainAspectRatio": false`). Diagrams: ```mermaid, or raw `<svg>` on one line.
- One idea per block: each paragraph, list, table and figure is a commentable block with its own history, so keep paragraphs focused.
- Sources at the end, with links.
