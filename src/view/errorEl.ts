import { QueryError } from "../query/types";

/** Replace the block's contents with a visible error. Never log-only. */
export function renderError(container: HTMLElement, error: unknown): void {
  container.empty();
  const box = container.createDiv({ cls: "ss-error" });
  box.createDiv({ cls: "ss-error-title", text: "Simple Streams" });
  box.createDiv({ cls: "ss-error-message", text: messageOf(error) });
}

function messageOf(error: unknown): string {
  if (error instanceof QueryError) {
    return error.line === undefined ? error.message : `Line ${error.line}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
