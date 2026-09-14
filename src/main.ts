import { Plugin } from "obsidian";
import { noteAt } from "./obsidian/adapter";
import { StreamRegistry } from "./obsidian/registry";
import { StreamChild } from "./view/StreamChild";

export default class SimpleStreamsPlugin extends Plugin {
  private registry: StreamRegistry | null = null;

  onload(): void {
    const registry = new StreamRegistry(this.app);
    this.registry = registry;
    for (const ref of registry.start()) {
      this.registerEvent(ref);
    }

    this.registerMarkdownCodeBlockProcessor("stream", (source, el, ctx) => {
      const child = new StreamChild(el, this.app, source, {
        sourcePath: ctx.sourcePath,
        scope: "this",
        note: () => noteAt(this.app, ctx.sourcePath),
        excludePath: null,
      });
      // Component.register runs on unload, so a closed note stops being refreshed.
      child.register(() => registry.unregister(child));
      registry.register(child);
      ctx.addChild(child);
    });
  }

  onunload(): void {
    this.registry?.stop();
    this.registry = null;
  }
}
