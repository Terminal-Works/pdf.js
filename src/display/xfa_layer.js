/* Copyright 2021 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { PageViewport } from "./display_utils.js";

class XfaLayer {
  static setupStorage(html, fieldId, element, storage, intent) {
    const storedData = storage.getValue(fieldId, { value: null });
    switch (element.name) {
      case "textarea":
        if (storedData.value !== null) {
          html.textContent = storedData.value;
        }
        if (intent === "print") {
          break;
        }
        html.addEventListener("input", event => {
          storage.setValue(fieldId, { value: event.target.value });
        });
        break;
      case "input":
        if (element.attributes.type === "radio") {
          if (storedData.value) {
            html.setAttribute("checked", true);
          }
          if (intent === "print") {
            break;
          }
          html.addEventListener("change", event => {
            const { target } = event;
            for (const radio of document.getElementsByName(target.name)) {
              if (radio !== target) {
                const id = radio.id;
                storage.setValue(id.split("-")[0], { value: false });
              }
            }
            storage.setValue(fieldId, { value: target.checked });
          });
        } else if (element.attributes.type === "checkbox") {
          if (storedData.value) {
            html.setAttribute("checked", true);
          }
          if (intent === "print") {
            break;
          }
          html.addEventListener("input", event => {
            storage.setValue(fieldId, { value: event.target.checked });
          });
        } else {
          if (storedData.value !== null) {
            html.setAttribute("value", storedData.value);
          }
          if (intent === "print") {
            break;
          }
          html.addEventListener("input", event => {
            storage.setValue(fieldId, { value: event.target.value });
          });
        }
        break;
      case "select":
        if (storedData.value !== null) {
          for (const option of element.children) {
            if (option.attributes.value === storedData.value) {
              option.attributes.selected = true;
            }
          }
        }
        html.addEventListener("input", event => {
          const options = event.target.options;
          const value =
            options.selectedIndex === -1
              ? null
              : options[options.selectedIndex].value;
          storage.setValue(fieldId, { value });
        });
        break;
    }
  }

  static setAttributes(html, element, storage, intent) {
    const { attributes } = element;
    if (attributes.type === "radio") {
      // Avoid to have a radio group when printing with the same as one
      // already displayed.
      attributes.name = `${attributes.name}-${intent}`;
    }
    for (const [key, value] of Object.entries(attributes)) {
      if (value === null || value === undefined || key === "fieldId") {
        continue;
      }

      if (key !== "style") {
        if (key === "textContent") {
          html.textContent = value;
        } else if (key === "class") {
          html.setAttribute(key, value.join(" "));
        } else {
          html.setAttribute(key, value);
        }
      } else {
        Object.assign(html.style, value);
      }
    }

    // Set the value after the others to be sure overwrite
    // any other values.
    if (storage && attributes.fieldId !== undefined) {
      this.setupStorage(html, attributes.fieldId, element, storage);
    }
  }

  static render(parameters) {
    const storage = parameters.annotationStorage;
    const root = parameters.xfa;
    const intent = parameters.intent;
    const rootHtml = document.createElement(root.name);
    if (root.attributes) {
      this.setAttributes(rootHtml, root);
    }
    const stack = [[root, -1, rootHtml]];

    const rootDiv = parameters.div;
    rootDiv.appendChild(rootHtml);

    let { viewport } = parameters;
    if (!(viewport instanceof PageViewport)) {
      viewport = new PageViewport(viewport);
    }
    const coeffs = viewport.transform.join(",");
    rootDiv.style.transform = `matrix(${coeffs})`;

    // Set defaults.
    rootDiv.setAttribute("class", "xfaLayer xfaFont");

    while (stack.length > 0) {
      const [parent, i, html] = stack[stack.length - 1];
      if (i + 1 === parent.children.length) {
        stack.pop();
        continue;
      }

      const child = parent.children[++stack[stack.length - 1][1]];
      if (child === null) {
        continue;
      }

      const { name } = child;
      if (name === "#text") {
        html.appendChild(document.createTextNode(child.value));
        continue;
      }

      let childHtml;
      if (child?.attributes?.xmlns) {
        childHtml = document.createElementNS(child.attributes.xmlns, name);
      } else {
        childHtml = document.createElement(name);
      }

      html.appendChild(childHtml);
      if (child.attributes) {
        this.setAttributes(childHtml, child, storage, intent);
      }

      if (child.children && child.children.length > 0) {
        stack.push([child, -1, childHtml]);
      } else if (child.value) {
        childHtml.appendChild(document.createTextNode(child.value));
      }
    }
  }

  /**
   * Update the xfa layer.
   *
   * @public
   * @param {XfaLayerParameters} parameters
   * @memberof XfaLayer
   */
  static update(parameters) {
    const transform = `matrix(${parameters.viewport.transform.join(",")})`;
    parameters.div.style.transform = transform;
    parameters.div.hidden = false;
  }
}

export { XfaLayer };
