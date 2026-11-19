# replica

**Local commentable documents for working with Claude Code.** Claude writes a long answer (a report, a plan, a design review) as a markdown document. You read it in the browser, select any passage and comment on it, tick choices instead of typing answers, and Claude replies in the thread and edits the block. Every edit becomes a version with a word diff. Everything stays on your machine.

It replaces two things that do not work well for long answers: walls of text in the terminal, and one-off HTML pages nobody can answer.

*Português abaixo.*

## What you get

- **Blocks with history.** The markdown is split into blocks (paragraph, list, table, chart, diagram). Each block has a fixed id and its own version history, with restore.
- **Comment on a selection or a block.** Threads look like a chat. Paste screenshots into a comment. Quote a previous message.
- **Choices you tick.** A list written as `- ( )`, `- [ ]` or `- {off}` under a `### question` becomes radio buttons, checkboxes or switches inside a card. What you tick reaches Claude as your message, so you do not need to write "I pick A".
- **Full keyboard use.** Tab through text, options and threads; arrows move the caret; Shift or Ctrl+Shift+arrows select; Tab on a selection opens a comment with the caret in it; Ctrl+Enter sends and puts the caret on the next line; Esc goes back; `?` lists the keys.
- **Live.** The page updates by server-sent events as Claude answers. A draft you are typing is never lost: redraws wait, and reloads restore it.
- **Claude Code native.** A CLI for the agent (`pendentes`, `responder`, `editar`, `escolhas`, `esperar`) and an MCP server with the same tools.
- **Charts and diagrams.** ` ```chart ` blocks (Chart.js config), ` ```mermaid `, and raw `<svg>`.

The interface and the CLI are in Brazilian Portuguese today. Translations are welcome (see CONTRIBUTING).

## Install

Requires Node 18 or newer. No dependencies at runtime.

```bash
git clone https://github.com/Caumaker/replica.git
cd replica
ln -s "$PWD/bin/replica" /usr/local/bin/replica   # or add bin/ to your PATH
replica servir &                                  # http://localhost:7743
```

Documents live in `~/.replica/docs` (`REPLICA_DIR` changes it; `REPLICA_PORT` changes the port). The server listens on 127.0.0.1 only.

### Claude Code

1. Add the MCP server:
   ```bash
   claude mcp add replica -- node /path/to/replica/bin/replica-mcp
   ```
2. Copy `skill/SKILL.md` to `~/.claude/skills/replica/SKILL.md`, so Claude knows when and how to publish, answer and edit.
3. Ask Claude for something long. It publishes the document, opens it, and waits with `replica esperar` for your comments.

## Write a document

```markdown
# Silo gate
One sentence with the conclusion.

> **Recommendation:** sector gate, 40 mm cylinder.

### S1: how to close the hopper
- (*) A (recommended): sector gate
- ( ) B: clamshell
- ( ) C: plate on the feed box

### S2: extras
- [x] brush in front of the feed box
- [ ] vibrator on the hopper

### S3: sensors
- {on} gate-closed sensor
```

`(*)`, `[x]` and `{on}` come pre-selected. A question you do not answer keeps the pre-selected option.

## CLI

```
replica servir [porta]
replica publicar <slug> <file.md> [--forcar]
replica blocos <slug>            replica bloco <slug> <id>
replica editar <slug> <id> @new.md [--comentario <id>] [--motivo "..."]
replica inserir <slug> <afterId> @new.md      replica remover <slug> <id>
replica pendentes [slug]         replica escolhas <slug>
replica responder <comment> "text" [--cita <msgId>]
replica resolver <comment>       replica esperar [seconds]
```

## Security

- Binds to 127.0.0.1. There is no authentication: do not expose the port.
- `/ver` opens local files read-only inside your home folder and refuses `.ssh`, `.gnupg`, `.aws`, `.env`, keys and similar.
- Pasted images are written as files in the document folder, never as base64 in the JSON.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md). The maintainer works together with Claude Code, which triages issues and reviews pull requests; a human approves every merge.

---

## Português

**Documentos comentáveis locais para trabalhar com o Claude Code.** O Claude escreve a resposta longa em markdown; você lê no navegador, seleciona qualquer trecho e comenta, marca as escolhas em vez de escrever, e o Claude responde no fio e edita o bloco. Toda edição vira versão, com a diferença palavra por palavra. Tudo fica na sua máquina.

Instalação, sintaxe e comandos estão acima. Escolhas: `- ( )` e `- (*)` escolha única, `- [ ]` e `- [x]` várias, `- {off}` e `- {on}` liga e desliga, logo abaixo de um `### título`. Teclado: Tab navega, setas andam no texto, Shift ou Ctrl+Shift+setas seleciona, Tab com seleção abre o comentário, Ctrl+Enter envia e volta para a linha de baixo, `?` mostra os atalhos.

## License

MIT
