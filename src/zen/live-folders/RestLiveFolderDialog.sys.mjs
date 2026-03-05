// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

const DEFAULT_CONFIG_JSON = `{
  "url": "https://api.example.com/items",
  "label": "",
  "icon": "",
  "headers": {},
  "mapping": {
    "items": "",
    "id": "id",
    "title": "title",
    "url": "url",
    "subtitle": "author"
  },
  "maxItems": 100
}`;

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ZenLiveFoldersManager: "resource:///modules/zen/ZenLiveFoldersManager.sys.mjs",
});

/**
 * Opens the Custom REST API Live Folder creation dialog.
 * The dialog shows a single JSON editor with the full config object.
 *
 * @param {Window} win - The browser window.
 * @returns {Promise<boolean>} - Resolves to true if a folder was created, false if cancelled.
 */
export async function openRestLiveFolderDialog(win) {
  const doc = win.document;
  const dialog = doc.createElementNS("http://www.w3.org/1999/xhtml", "dialog");
  dialog.setAttribute("id", "zen-rest-live-folder-dialog");
  dialog.className = "zen-rest-live-folder-dialog";

  const form = doc.createElementNS("http://www.w3.org/1999/xhtml", "form");
  form.method = "dialog";

  const titleEl = doc.createElementNS("http://www.w3.org/1999/xhtml", "h2");
  titleEl.className = "zen-rest-dialog-title";

  const configLabel = doc.createElementNS("http://www.w3.org/1999/xhtml", "label");
  configLabel.setAttribute("data-l10n-id", "zen-live-folder-rest-dialog-config");
  configLabel.htmlFor = "zen-rest-dialog-config";
  const configTextarea = doc.createElementNS("http://www.w3.org/1999/xhtml", "textarea");
  configTextarea.id = "zen-rest-dialog-config";
  configTextarea.rows = 20;
  configTextarea.spellcheck = false;
  configTextarea.value = DEFAULT_CONFIG_JSON;

  const hintEl = doc.createElementNS("http://www.w3.org/1999/xhtml", "p");
  hintEl.className = "zen-rest-dialog-hint";

  const buttons = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
  buttons.className = "zen-rest-dialog-buttons";
  const createBtn = doc.createElementNS("http://www.w3.org/1999/xhtml", "button");
  createBtn.type = "submit";
  createBtn.setAttribute("data-l10n-id", "zen-live-folder-rest-dialog-create");
  createBtn.className = "zen-rest-dialog-create";
  const cancelBtn = doc.createElementNS("http://www.w3.org/1999/xhtml", "button");
  cancelBtn.type = "button";
  cancelBtn.setAttribute("data-l10n-id", "zen-live-folder-rest-dialog-cancel");
  cancelBtn.className = "zen-rest-dialog-cancel";
  buttons.appendChild(createBtn);
  buttons.appendChild(cancelBtn);

  form.appendChild(titleEl);
  form.appendChild(configLabel);
  form.appendChild(configTextarea);
  form.appendChild(hintEl);
  form.appendChild(buttons);
  dialog.appendChild(form);

  doc.documentElement.appendChild(dialog);

  const ids = [
    "zen-live-folder-rest-dialog-title",
    "zen-live-folder-rest-dialog-config",
    "zen-live-folder-rest-dialog-create",
    "zen-live-folder-rest-dialog-cancel",
    "zen-live-folder-rest-dialog-hint",
  ];
  let titleStr;
  let configLabelStr;
  let createLabelStr;
  let cancelLabelStr;
  let hintStr;
  try {
    [titleStr, configLabelStr, createLabelStr, cancelLabelStr, hintStr] =
      await doc.l10n.formatValues(ids);
  } catch {
    titleStr = "Create Custom REST Live Folder";
    configLabelStr = "Configuration (JSON)";
    createLabelStr = "Create";
    cancelLabelStr = "Cancel";
    hintStr = "Include: url, label, icon (optional, use \"favicon\" for favicon from API origin), headers, mapping";
  }

  const fallback = (s, d) => (s != null && s !== "" ? s : d);
  dialog.setAttribute("aria-label", fallback(titleStr, "Create Custom REST Live Folder"));
  titleEl.textContent = fallback(titleStr, "Create Custom REST Live Folder");
  configLabel.textContent = fallback(configLabelStr, "Configuration (JSON)");
  createBtn.textContent = fallback(createLabelStr, "Create");
  cancelBtn.textContent = fallback(cancelLabelStr, "Cancel");
  hintEl.textContent = fallback(
    hintStr,
    'Include: url, label, icon (optional, use "favicon" for favicon from API origin), headers, mapping'
  );

  return new Promise((resolve) => {
    function cleanup() {
      dialog.remove();
    }

    cancelBtn.addEventListener("click", () => {
      dialog.close();
      cleanup();
      resolve(false);
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      let config;
      try {
        config = JSON.parse(configTextarea.value || "{}");
      } catch {
        win.gZenUIManager?.showToast?.("zen-live-folder-rest-invalid-json", {
          timeout: 4000,
        });
        return;
      }

      const url = config.url;
      if (!url || typeof url !== "string") {
        win.gZenUIManager?.showToast?.("zen-live-folder-rest-invalid-url", {
          timeout: 4000,
        });
        return;
      }

      try {
        new URL(url);
      } catch {
        win.gZenUIManager?.showToast?.("zen-live-folder-rest-invalid-url", {
          timeout: 4000,
        });
        return;
      }

      const protocol = new URL(url).protocol;
      if (protocol !== "http:" && protocol !== "https:") {
        win.gZenUIManager?.showToast?.("zen-live-folder-rest-invalid-url", {
          timeout: 4000,
        });
        return;
      }

      const mapping = config.mapping;
      if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
        win.gZenUIManager?.showToast?.("zen-live-folder-rest-invalid-json", {
          timeout: 4000,
        });
        return;
      }

      const required = ["items", "id", "title", "url"];
      for (const key of required) {
        if (mapping[key] === undefined || mapping[key] === null) {
          win.gZenUIManager?.showToast?.("zen-live-folder-rest-invalid-json", {
            timeout: 4000,
          });
          return;
        }
      }

      let headers = {};
      if (config.headers && typeof config.headers === "object" && !Array.isArray(config.headers)) {
        for (const [k, v] of Object.entries(config.headers)) {
          if (k && v != null && typeof v === "string") {
            headers[k] = v;
          }
        }
      }

      const createConfig = {
        url,
        mapping,
        label: config.label && typeof config.label === "string" ? config.label : undefined,
        icon: config.icon && typeof config.icon === "string" ? config.icon : undefined,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        maxItems:
          config.maxItems != null && Number.isFinite(config.maxItems) ? config.maxItems : undefined,
      };

      const created = await lazy.ZenLiveFoldersManager.createFolderFromRestConfig(
        win,
        createConfig
      );

      dialog.close();
      cleanup();
      resolve(created !== -1);
    });

    dialog.showModal();
  });
}
