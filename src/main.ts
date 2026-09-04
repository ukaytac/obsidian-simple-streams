import { Plugin } from "obsidian";
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
      const child = new StreamChild(el, this.app, source, ctx.sourcePath);
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
