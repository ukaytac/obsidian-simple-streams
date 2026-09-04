import { MarkdownRenderChild, MarkdownRenderer, type App, type Component } from "obsidian";
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
    ctx.app.workspace.openLinkText(
      note.path,
      ctx.sourcePath,
      event.metaKey || event.ctrlKey,
    );
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

function formatItemDate(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(ms));
}
