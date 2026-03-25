import type { CandidateElement, PageSnapshot } from "../shared/contracts";

const CANDIDATE_SELECTOR =
  "a,button,input,textarea,select,[role='button'],[role='link'],[contenteditable='true']";

const MAX_CANDIDATES = 60;

function cssPath(element: Element): string {
  if (!(element instanceof HTMLElement)) {
    return element.tagName.toLowerCase();
  }

  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }

  // For form elements, prefer attribute-based selectors that are more stable
  const tag = element.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") {
    const name = element.getAttribute("name");
    if (name && document.querySelectorAll(`${tag}[name=${CSS.escape(name)}]`).length === 1) {
      return `${tag}[name=${CSS.escape(name)}]`;
    }
    const type = (element as HTMLInputElement).type;
    const placeholder = element.getAttribute("placeholder");
    if (placeholder && document.querySelectorAll(`${tag}[placeholder=${CSS.escape(placeholder)}]`).length === 1) {
      return `${tag}[placeholder=${CSS.escape(placeholder)}]`;
    }
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel && document.querySelectorAll(`${tag}[aria-label=${CSS.escape(ariaLabel)}]`).length === 1) {
      return `${tag}[aria-label=${CSS.escape(ariaLabel)}]`;
    }
    // Combine name + type for uniqueness
    if (name && type) {
      const combo = `${tag}[name=${CSS.escape(name)}][type=${CSS.escape(type)}]`;
      if (document.querySelectorAll(combo).length === 1) {
        return combo;
      }
    }
  }

  // For buttons/links, prefer text-based or aria selectors
  if (tag === "button" || tag === "a") {
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel && document.querySelectorAll(`${tag}[aria-label=${CSS.escape(ariaLabel)}]`).length === 1) {
      return `${tag}[aria-label=${CSS.escape(ariaLabel)}]`;
    }
  }

  const parts: string[] = [];
  let current: HTMLElement | null = element;
  while (current && parts.length < 4) {
    let part = current.tagName.toLowerCase();
    if (current.classList.length > 0) {
      part += `.${Array.from(current.classList).slice(0, 2).map(CSS.escape).join(".")}`;
    }
    const parent: HTMLElement | null = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((s: Element) => s.tagName === current!.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        part += `:nth-of-type(${index})`;
      }
    }
    parts.unshift(part);
    current = parent;
  }
  return parts.join(" > ");
}

function isVisible(el: HTMLElement): boolean {
  if (el.offsetParent === null && el.tagName !== "BODY") {
    return false;
  }
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

export function collectSnapshot(): PageSnapshot {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>(CANDIDATE_SELECTOR)
  )
    .filter(isVisible)
    .slice(0, MAX_CANDIDATES);

  const candidates: CandidateElement[] = nodes.map((node) => {
    const placeholder =
      (node as HTMLInputElement).placeholder?.trim() || node.getAttribute("placeholder")?.trim();
    return {
      selector: cssPath(node),
      role: node.getAttribute("role") ?? node.tagName.toLowerCase(),
      text: (node.innerText || node.getAttribute("aria-label") || node.getAttribute("name") || "").trim().slice(0, 120),
      placeholder: placeholder || undefined
    };
  });

  const textPreview = document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 1500);

  return {
    url: window.location.href,
    title: document.title,
    textPreview,
    candidates
  };
}
