---
name: replica
description: Every long answer for the user (report, plan, analysis, comparison, answer with tables or decisions) becomes a local commentable document at http://localhost:7743/<slug>. The user selects passages, comments and ticks choices; you answer in the thread and edit the block, and each edit becomes a version. Trigger: any long deliverable, "/replica", "publish it so I can comment".
---

# replica: a document the user comments and you answer

## Publish
1. Write a well-structured `.md` in the project folder (it stays as the source).
2. `replica publicar <slug> <file.md>` (short slug, lowercase and hyphens). `--forcar` recreates it and drops history: only if the user asks.
3. Open `http://localhost:7743/<slug>` and say one line in the terminal with the link. Nothing else in the terminal.
4. Keep `replica esperar 3500` running in the background. When it fires, handle the comments and start it again.

## Decisions are things to tick
Under `### S1: question`, write the options as a list:
- `- ( ) option` single choice, `- (*) option` pre-selected (use it for your recommendation)
- `- [ ] option` multiple choice, `- [x]` pre-selected
- `- {off} option` on/off switch, `- {on}` pre-selected
Keep each option's reason on its own line. A question the user leaves untouched follows the pre-selected option. `replica escolhas <slug>` shows the state of every question.

## Answer comments
- `replica pendentes` shows each comment: selection, request, current block text, quoted message and pasted images (read the image file before answering).
- Question: `replica responder <comment> "<answer>"`, short, with numbers and sources. Long answer: write it to a file and use `@file.md` (light markdown renders in the bubble).
- Text change: `replica editar <slug> <block> @new.md --motivo "<what changed>"`. The change applies to the whole block, so rewrite it coherently. If it affects other blocks, edit them too.
- Several changes from one comment: edit without `--comentario` and send ONE consolidated answer at the end listing what changed and where.
- New block: `replica inserir <slug> <afterId> @new.md`. Remove: `replica remover` (hides; history keeps it).
- Never resolve a thread yourself: the user does.

## Writing the .md
- First line `# Title`, then one sentence with the conclusion.
- `> ` for the summary and highlights; `## ` per section, each opening with its answer.
- Tables to compare; lists only for parallel items; short sentences.
- Charts: ```chart with a Chart.js config in JSON. Diagrams: ```mermaid or raw `<svg>` on one line.
- One idea per block: each paragraph, list, table and figure is a commentable block with its own history.
- Sources at the end, with links.
