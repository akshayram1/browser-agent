import type { AgentAction } from "../shared/contracts";

function mustFind(selector: string): HTMLElement {
  const node = document.querySelector(selector);
  if (!(node instanceof HTMLElement)) {
    throw new Error(`Selector not found: ${selector}`);
  }
  return node;
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
