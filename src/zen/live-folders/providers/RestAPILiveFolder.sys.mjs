// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import { nsZenLiveFolderProvider } from "resource:///modules/zen/ZenLiveFolder.sys.mjs";

const MAX_RESPONSE_SIZE = 1024 * 1024; // 1 MB per spec
const DEFAULT_MAX_ITEMS = 100;

/**
 * Resolves a dot-notation path in an object (e.g. "data.posts" -> obj.data.posts).
 * Empty path returns the object itself.
 *
 * @param {object} obj - The root object.
 * @param {string} path - Dot-separated path (e.g. "data.items", "" for root).
 * @returns {unknown} The value at the path, or undefined if not found.
 */
function getByPath(obj, path) {
  if (!path || typeof path !== "string") {
    return obj;
  }
  const parts = path.trim().split(".").filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

export class nsRestAPILiveFolderProvider extends nsZenLiveFolderProvider {
  static type = "rest";

  constructor({ id, state, manager }) {
    super({ id, state, manager });

    this.state.url = state.url ?? "";
    this.state.mapping = state.mapping ?? {
      items: "",
      id: "id",
      title: "title",
      url: "url",
    };
    this.state.label = state.label ?? "";
    this.state.icon = state.icon ?? "";
    this.state.maxItems = state.maxItems ?? DEFAULT_MAX_ITEMS;
    this.state.headers = state.headers && typeof state.headers === "object" ? state.headers : {};
  }

  async fetchItems() {
    try {
      const { text } = await this.fetch(this.state.url, {
        maxContentLength: MAX_RESPONSE_SIZE,
        headers: this.state.headers,
      });

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        return "zen-live-folder-failed-fetch";
      }

      const mapping = this.state.mapping;
      const itemsPath = mapping.items ?? "";
      let items = getByPath(data, itemsPath);

      if (!Array.isArray(items)) {
        if (itemsPath === "" && Array.isArray(data)) {
          items = data;
        } else {
          return "zen-live-folder-failed-fetch";
        }
      }

      const maxItems = this.state.maxItems ?? DEFAULT_MAX_ITEMS;
      const mapped = items
        .slice(0, maxItems)
        .map((item) => {
          const id = getByPath(item, mapping.id ?? "id");
          const title = getByPath(item, mapping.title ?? "title");
          const url = getByPath(item, mapping.url ?? "url");
          if (id == null || title == null || url == null) {
            return null;
          }
          const result = {
            id: String(id),
            title: String(title),
            url: String(url),
          };
          if (mapping.subtitle) {
            const subtitle = getByPath(item, mapping.subtitle);
            if (subtitle != null) {
              result.subtitle = String(subtitle);
            }
          }
          return result;
        })
        .filter(Boolean);

      return mapped;
    } catch (error) {
      console.error("Error fetching or parsing REST API:", error);
      return "zen-live-folder-failed-fetch";
    }
  }

  getMetadata() {
    let icon = this.state.icon || "chrome://browser/skin/zen-icons/selectable/code.svg";
    if (icon === "favicon" && this.state.url) {
      try {
        const origin = new URL(this.state.url).origin;
        icon = `${origin}/favicon.ico`;
      } catch {
        icon = "chrome://browser/skin/zen-icons/selectable/code.svg";
      }
    }
    return {
      label: this.state.label || this.state.url || "REST API",
      icon,
    };
  }

  get options() {
    return [
      {
        l10nId: "zen-live-folder-rest-option-headers",
        key: "editHeaders",
      },
    ];
  }

  onOptionTrigger(option) {
    super.onOptionTrigger(option);
    const key = option.getAttribute("option-key");
    if (key === "editHeaders") {
      this.#promptForHeaders();
    }
  }

  async #promptForHeaders() {
    const lazy = {};
    ChromeUtils.defineLazyGetter(
      lazy,
      "l10n",
      () => new Localization(["browser/zen-live-folders.ftl"])
    );
    const current = JSON.stringify(this.state.headers || {}, null, 2);
    const input = { value: current };
    const [prompt] = await lazy.l10n.formatValues(["zen-live-folder-rest-prompt-headers"]);
    const ok = Services.prompt.prompt(
      this.manager.window,
      null,
      prompt,
      input,
      null,
      { value: null }
    );
    if (!ok) {
      return;
    }
    try {
      const parsed = input.value?.trim()
        ? JSON.parse(input.value)
        : {};
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        this.state.headers = parsed;
        this.refresh();
        this.requestSave();
      }
    } catch {
      this.manager.window.gZenUIManager?.showToast?.("zen-live-folder-rest-invalid-json", {
        timeout: 4000,
      });
    }
  }

  serialize() {
    return {
      state: {
        ...this.state,
        url: this.state.url,
        mapping: this.state.mapping,
        label: this.state.label,
        icon: this.state.icon,
        maxItems: this.state.maxItems,
        headers: this.state.headers,
      },
    };
  }
}
