export interface MockCachedMetadata {
  frontmatter?: Record<string, unknown>;
  tags?: Array<{ tag: string }>;
}

/**
 * Enough of Obsidian's `getAllTags` for the adapter's tests: frontmatter tags
 * plus inline tags, each hash-prefixed, or `null` when a note has none.
 *
 * Fidelity caveat: this reads only the plural `tags` key. Obsidian's own
 * `parseFrontMatterTags` also accepts a singular `tag`, so a note using that
 * key looks untagged here and tagged in a real vault. Task 23's manual pass
 * over a live vault is what covers the difference; nothing in the engine
 * branches on which key was used.
 */
export function getAllTags(cache: MockCachedMetadata): string[] | null {
  const tags: string[] = [];

  const fromFrontmatter = cache.frontmatter?.tags;
  if (typeof fromFrontmatter === "string") {
    tags.push(...fromFrontmatter.split(/[,\s]+/).filter((tag) => tag.length > 0));
  } else if (Array.isArray(fromFrontmatter)) {
    // Strings only. `String()` coerces a nested `["book", "read"]` into the
    // single tag `"book,read"` and `null` into `"null"`, inventing tags the
    // real `getAllTags` would never report from the same frontmatter.
    tags.push(...fromFrontmatter.filter((tag): tag is string => typeof tag === "string"));
  }

  for (const inline of cache.tags ?? []) {
    tags.push(inline.tag);
  }

  if (tags.length === 0) {
    return null;
  }
  return tags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
}

/**
 * Obsidian's Component lifecycle, implemented rather than stubbed, because the
 * two sentences its own docs make about it are exactly what the view layer's
 * leak tests are about: `addChild` "adds a child component, loading it if this
 * component is loaded", and `unload` unloads "this component and its children".
 * A child added to a parent that is not loaded is therefore never loaded, and
 * so is never unloaded — the orphan `StreamChild.onunload` exists to bound.
 */
export class Component {
  /** True between `load()` and `unload()`. */
  loaded = false;
  /** True once `load()` has ever run. A child that never loaded never unloads. */
  everLoaded = false;
  readonly children: Component[] = [];
  private readonly unloadCallbacks: Array<() => unknown> = [];

  load(): void {
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    this.everLoaded = true;
    this.onload();
    for (const child of [...this.children]) {
      child.load();
    }
  }

  unload(): void {
    if (!this.loaded) {
      return;
    }
    this.loaded = false;
    for (;;) {
      const child = this.children.pop();
      if (child === undefined) {
        break;
      }
      child.unload();
    }
    for (const callback of this.unloadCallbacks.splice(0)) {
      callback();
    }
    this.onunload();
  }

  onload(): void {}

  onunload(): void {}

  addChild<T extends Component>(component: T): T {
    this.children.push(component);
    if (this.loaded) {
      component.load();
    }
    return component;
  }

  removeChild<T extends Component>(component: T): T {
    const at = this.children.indexOf(component);
    if (at !== -1) {
      this.children.splice(at, 1);
    }
    component.unload();
    return component;
  }

  register(callback: () => unknown): void {
    this.unloadCallbacks.push(callback);
  }
}

/**
 * Every MarkdownRenderChild built during a test, in construction order — the
 * stream's own child first, then one per rendered item. Tests read `loaded` and
 * `everLoaded` off these to tell an unloaded child from one that never loaded.
 */
export const renderChildren: MarkdownRenderChild[] = [];

export class MarkdownRenderChild extends Component {
  readonly containerEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    super();
    this.containerEl = containerEl;
    renderChildren.push(this);
  }
}

export class Plugin extends Component {}

export interface RenderCall {
  markdown: string;
  el: HTMLElement;
  sourcePath: string;
  component: Component;
}

/** Every `MarkdownRenderer.render` call, in order. Cleared by `resetObsidianMock`. */
export const renderCalls: RenderCall[] = [];

let renderHook: ((call: RenderCall) => Promise<void> | void) | null = null;

/**
 * Run something inside `MarkdownRenderer.render`. The only way a test can make
 * item rendering throw without touching `src/`, which is what the error-path
 * tests need: the throw has to come from a real collaborator of the real
 * `renderItem`, not from a replaced `renderItem`.
 */
export function setRenderHook(hook: ((call: RenderCall) => Promise<void> | void) | null): void {
  renderHook = hook;
}

export class MarkdownRenderer {
  static async render(
    _app: unknown,
    markdown: string,
    el: HTMLElement,
    sourcePath: string,
    component: Component,
  ): Promise<void> {
    const call: RenderCall = { markdown, el, sourcePath, component };
    renderCalls.push(call);
    if (renderHook !== null) {
      await renderHook(call);
    }
    // Something visible, so a test can tell a rendered body from an empty one.
    el.createDiv({ cls: "ss-rendered", text: markdown });
  }
}

/** Drop the state the mock accumulates. Call between tests in one file. */
export function resetObsidianMock(): void {
  renderChildren.length = 0;
  renderCalls.length = 0;
  renderHook = null;
}
