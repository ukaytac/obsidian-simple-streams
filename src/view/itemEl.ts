import { MarkdownRenderChild, MarkdownRenderer, Notice, type App, type Component } from "obsidian";
import { resolveNoteDate } from "../engine/fields";
import { extractPreview, stripFrontmatter } from "../engine/preview";
import type { NoteMeta } from "../engine/note";
import type { StreamQuery } from "../query/types";

export interface ItemContext {
  app: App;
  query: StreamQuery;
  /** The stream's own render child, so per-item children unload with the block. */
  parent: Component;
  /** Path of the note holding the stream block, for link resolution. */
  sourcePath: string;
}

export async function renderItem(
  container: HTMLElement,
  note: NoteMeta,
  ctx: ItemContext,
): Promise<void> {
  const item = container.createDiv({ cls: "ss-item" });
  renderHeader(item, note, ctx);

  if (ctx.query.display === "title") {
    return;
  }

  const file = ctx.app.vault.getFileByPath(note.path);
  if (file === null) {
    item.createDiv({ cls: "ss-item-warning", text: `Could not open ${note.path}` });
    return;
  }

  let content: string;
  try {
    content = await ctx.app.vault.cachedRead(file);
  } catch (error) {
    // One unreadable note must not take the rest of the stream with it.
    item.createDiv({
      cls: "ss-item-warning",
      text: `Could not read ${note.path}: ${error instanceof Error ? error.message : String(error)}`,
    });
    return;
  }

  const body = item.createDiv({ cls: "ss-item-body" });
  if (ctx.query.display === "preview") {
    body.setText(extractPreview(content, note.basename, ctx.query.previewLength));
    return;
  }

  if (note.path === ctx.sourcePath) {
    // The host note is in its own stream, which `folder`-less queries do by
    // default. Rendering its full body here re-renders the very block doing
    // the rendering: the code block processor is registered app-wide, so it
    // fires again on this note's own `stream` fence, and the stream renders
    // itself inside itself without end. A preview says the same thing and
    // terminates.
    body.setText(extractPreview(content, note.basename, ctx.query.previewLength));
    item.createDiv({
      cls: "ss-item-warning",
      text: "Shown as a preview: this is the note holding the stream, and rendering it in full would nest the stream inside itself.",
    });
    return;
  }

  const child = new MarkdownRenderChild(body);
  ctx.parent.addChild(child);
  await MarkdownRenderer.render(ctx.app, stripFrontmatter(content), body, note.path, child);
}

function renderHeader(item: HTMLElement, note: NoteMeta, ctx: ItemContext): void {
  const header = item.createDiv({ cls: "ss-item-header" });

  const link = header.createEl("a", {
    cls: "ss-item-title",
    text: note.basename,
    href: note.path,
  });
  link.addEventListener("click", (event) => {
    event.preventDefault();
    // `openLinkText` is async, and a click is the one place a stream's view of
    // the vault can be stale: the note was there when the stream rendered and
    // may have been renamed or deleted since. Unhandled, that rejection is a
    // console message and a link that does nothing; a Notice at least says so.
    ctx.app.workspace
      .openLinkText(note.path, ctx.sourcePath, event.metaKey || event.ctrlKey)
      .catch(() => {
        new Notice(`Simple Streams could not open ${note.path}`);
      });
  });

  header.createSpan({
    cls: "ss-item-date",
    text: formatItemDate(resolveNoteDate(note, ctx.query.dateField)),
  });

  if (note.tags.length > 0) {
    const tags = header.createDiv({ cls: "ss-item-tags" });
    for (const tag of note.tags) {
      tags.createSpan({ cls: "ss-item-tag", text: `#${tag}` });
    }
  }
}

/**
 * The host locale, deliberately, and this has to stay in step with
 * `formatGroupHeader`'s default and with `sortNotes`'s — both take an optional
 * locale so a test can pin one, and nothing in the view passes it, so all three
 * follow the host and agree. Adding a `locale` to `ItemContext` with no caller
 * to supply it would be plumbing without a source; the coupling is recorded
 * here instead, because a stream whose headers and item dates disagreed about
 * the reader's language is exactly the kind of split this project keeps finding.
 */
function formatItemDate(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(ms));
}
