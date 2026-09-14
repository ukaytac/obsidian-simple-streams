/** What the plugin persists. One query, for the sidebar. */
export interface SimpleStreamsSettings {
  /** The sidebar's stream query, in the same syntax a `stream` block uses. */
  sidebarQuery: string;
}

/**
 * A query that does something useful the moment the sidebar is opened, rather
 * than an empty box: notes sharing the active note's `Project`, newest first.
 * A vault with no `Project` property gets the unresolved-reference notice,
 * which names the property to add — a better first run than a blank pane with
 * no hint of what to type.
 */
export const DEFAULT_SETTINGS: SimpleStreamsSettings = {
  sidebarQuery: "where:\n  Project: active.Project\nsort: file.mtime desc\ndisplay: preview\n",
};
