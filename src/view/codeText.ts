/**
 * Write a message into `el`, turning `` `backtick spans` `` into `<code>`.
 *
 * Every error and notice this plugin writes is authored with backticks around
 * the field names it is talking about — `sort`, `where.nights`, `limit` — which
 * is the right way to write them and was being rendered literally, so the
 * reader saw the punctuation instead of the emphasis.
 *
 * Deliberately not Markdown. This runs on the path that reports a failure, and
 * `MarkdownRenderer.render` is async, needs a Component to own its children,
 * and can itself throw — three things an error box must not depend on. A
 * message with an unpaired backtick keeps it as a literal character rather than
 * swallowing the rest of the text, because a mangled explanation is worse than
 * a slightly ugly one.
 */
export function setCodeText(el: HTMLElement, message: string): void {
  el.empty();
  const parts = message.split("`");
  // An even number of backticks leaves an odd number of parts, and every second
  // part is then a closed span. An odd number leaves the last one unclosed, so
  // its backtick is restored and it is written as text.
  const unpaired = parts.length % 2 === 0;
  parts.forEach((part, index) => {
    if (part === "") {
      return;
    }
    const isCode = index % 2 === 1 && !(unpaired && index === parts.length - 1);
    if (isCode) {
      el.createEl("code", { text: part });
    } else {
      el.appendText(index === parts.length - 1 && unpaired ? `\`${part}` : part);
    }
  });
}
