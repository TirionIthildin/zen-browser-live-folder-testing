// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

const DEFAULT_MAPPING_JSON = `{
  "items": "",
  "id": "id",
  "title": "title",
  "url": "url",
  "subtitle": "author"
}`;

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ZenLiveFoldersManager: "resource:///modules/zen/ZenLiveFoldersManager.sys.mjs",
});

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["browser/zen-live-folders.ftl"])
);

/**
 * Opens the Custom REST API Live Folder creation dialog.
 *
 * @param {Window} win - The browser window.
 * @returns {Promise<boolean>} - Resolves to true if a folder was created, false if cancelled.
 */
export async function openRestLiveFolderDialog(win) {
  const doc = win.document;
  const dialog = doc.createElementNS("http://www.w3.org/1999/xhtml", "dialog");
  dialog.setAttribute("id", "zen-rest-live-folder-dialog");
  dialog.setAttribute("data-l10n-id", "zen-live-folder-rest-dialog-title");
  dialog.className = "zen-rest-live-folder-dialog";

  const form = doc.createElementNS("http://www.w3.org/1999/xhtml", "form");
  form.method = "dialog";

  const urlLabel = doc.createElementNS("http://www.w3.org/1999/xhtml", "label");
  urlLabel.setAttribute("data-l10n-id", "zen-live-folder-rest-dialog-url");
  urlLabel.htmlFor = "zen-rest-dialog-url";
  const urlInput = doc.createElementNS("http://www.w3.org/1999/xhtml", "input");
  urlInput.id = "zen-rest-dialog-url";
  urlInput.type = "url";
  urlInput.required = true;
  urlInput.placeholder = "https://api.example.com/items";

  const labelLabel = doc.createElementNS("http://www.w3.org/1999/xhtml", "label");
  labelLabel.setAttribute("data-l10n-id", "zen-live-folder-rest-dialog-label");
  labelLabel.htmlFor = "zen-rest-dialog-label";
  const labelInput = doc.createElementNS("http://www.w3.org/1999/xhtml", "input");
  labelInput.id = "zen-rest-dialog-label";
  labelInput.type = "text";
  labelInput.placeholder = "";

  const mappingLabel = doc.createElementNS("http://www.w3.org/1999/xhtml", "label");
  mappingLabel.setAttribute("data-l10n-id", "zen-live-folder-rest-dialog-mapping");
  mappingLabel.htmlFor = "zen-rest-dialog-mapping";
  const mappingTextarea = doc.createElementNS("http://www.w3.org/1999/xhtml", "textarea");
  mappingTextarea.id = "zen-rest-dialog-mapping";
  mappingTextarea.rows = 10;
  mappingTextarea.value = DEFAULT_MAPPING_JSON;

  const buttons = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
  buttons.className = "zen-rest-dialog-buttons";
  const createBtn = doc.createElementNS("http://www.w3.org/1999/xhtml", "button");
  createBtn.type = "submit";
  createBtn.setAttribute("data-l10n-id", "zen-live-folder-rest-dialog-create");
  createBtn.className = "zen-rest-dialog-create";
  const cancelBtn = doc.createElementNS("http://www.w3.org/1999/xhtml", "button");
  cancelBtn.type = "button";
  cancelBtn.setAttribute("data-l10n-id", "zen-general-cancel-label");
  cancelBtn.className = "zen-rest-dialog-cancel";
  buttons.appendChild(createBtn);
  buttons.appendChild(cancelBtn);

  form.appendChild(urlLabel);
  form.appendChild(urlInput);
  form.appendChild(labelLabel);
  form.appendChild(labelInput);
  form.appendChild(mappingLabel);
  form.appendChild(mappingTextarea);
  form.appendChild(buttons);
  dialog.appendChild(form);

  doc.documentElement.appendChild(dialog);

  // Apply l10n
  doc.l10n.translateFragment(dialog);

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

      const url = urlInput.value?.trim();
      const label = labelInput.value?.trim();
      let mapping;

      try {
        mapping = JSON.parse(mappingTextarea.value || "{}");
      } catch {
        win.gZenUIManager?.showToast?.("zen-live-folder-rest-invalid-json", {
          timeout: 4000,
        });
        return;
      }

      if (!url) {
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

      const required = ["items", "id", "title", "url"];
      for (const key of required) {
        const val = mapping[key];
        if (val === undefined || val === null) {
          win.gZenUIManager?.showToast?.("zen-live-folder-rest-invalid-json", {
            timeout: 4000,
          });
          return;
        }
      }

      const config = { url, mapping };
      if (label) {
        config.label = label;
      }

      const created = await lazy.ZenLiveFoldersManager.createFolderFromRestConfig(
        win,
        config
      );

      dialog.close();
      cleanup();
      resolve(created !== -1);
    });

    dialog.showModal();
  });
}
