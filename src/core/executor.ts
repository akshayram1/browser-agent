import type { AgentAction } from "../shared/contracts";

function mustFind(selector: string): HTMLElement {
  const node = document.querySelector(selector);
  if (node instanceof HTMLElement) {
    return node;
  }

  // Fallback: if selector looks like a bare nth-of-type or is invalid,
  // try to find the element by tag and common attributes extracted from the selector
  const tagMatch = selector.match(/^(\w+)/);
  if (tagMatch) {
    const tag = tagMatch[1];
    // Try matching by name, placeholder, or aria-label attributes in the selector
    const attrMatch = selector.match(/\[(\w[\w-]*)=["']?([^\]"']+)["']?\]/);
    if (attrMatch) {
      const fallback = document.querySelector(`${tag}[${attrMatch[1]}="${attrMatch[2]}"]`);
      if (fallback instanceof HTMLElement) return fallback;
    }
    // Last resort: if only one element of that tag exists, use it
    const allOfTag = document.querySelectorAll(tag);
    if (allOfTag.length === 1 && allOfTag[0] instanceof HTMLElement) {
      return allOfTag[0];
    }
  }

  throw new Error(`Selector not found: ${selector}`);
}

function dispatchInputEvents(el: HTMLInputElement | HTMLTextAreaElement): void {
  el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

export async function executeAction(action: AgentAction): Promise<string> {
  switch (action.type) {
    case "click": {
      const el = mustFind(action.selector);
      if ((el as HTMLButtonElement).disabled) {
        throw new Error(`Element is disabled: ${action.selector}`);
      }
      el.click();
      return `Clicked ${action.selector}`;
    }
    case "type": {
      const input = mustFind(action.selector) as HTMLInputElement | HTMLTextAreaElement;
      input.focus();
      if (action.clearFirst) {
        input.value = "";
        dispatchInputEvents(input);
      }
      input.value = `${input.value}${action.text}`;
      dispatchInputEvents(input);
      if (input.value.indexOf(action.text) === -1) {
        throw new Error(`Type verification failed: value did not update for ${action.selector}`);
      }
      return `Typed into ${action.selector}`;
    }
    case "navigate": {
      window.location.href = action.url;
      return `Navigated to ${action.url}`;
    }
    case "extract": {
      const value = mustFind(action.selector).innerText.trim();
      if (!value) {
        throw new Error(`Extract returned empty text from ${action.selector}`);
      }
      return `${action.label}: ${value}`;
    }
    case "scroll": {
      const target = action.selector ? mustFind(action.selector) : document.documentElement;
      target.scrollBy({ top: action.deltaY, behavior: "smooth" });
      return `Scrolled ${action.deltaY > 0 ? "down" : "up"} ${Math.abs(action.deltaY)}px`;
    }
    case "focus": {
      mustFind(action.selector).focus();
      return `Focused ${action.selector}`;
    }
    case "wait": {
      await new Promise((resolve) => setTimeout(resolve, action.ms));
      return `Waited ${action.ms}ms`;
    }
    case "done": {
      return action.reason;
    }
    default:
      return "No-op";
  }
}
