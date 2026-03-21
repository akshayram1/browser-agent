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
  if (el.offsetParent === null && el.tagName !== "BODY") return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  // Zero-dimension elements are functionally hidden
  const rect = el.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

function isInViewport(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return (
    rect.bottom > 0 &&
    rect.top < window.innerHeight &&
    rect.right > 0 &&
    rect.left < window.innerWidth
  );
}

/** Resolve the visible label text via for/id, aria-labelledby, aria-label, or wrapping <label>. */
function getAssociatedLabel(el: HTMLElement): string {
  if (el.id) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`);
    if (label) return label.innerText.trim();
  }

  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl) return labelEl.innerText.trim();
  }

  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel.trim();

  const parentLabel = el.closest("label");
  if (parentLabel) {
    return Array.from(parentLabel.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" ");
  }

  return "";
}

export function collectSnapshot(): PageSnapshot {
  const allNodes = Array.from(
    document.querySelectorAll<HTMLElement>(CANDIDATE_SELECTOR)
  ).filter(isVisible);

  // In-viewport elements first so the model sees the most relevant candidates first
  const inView = allNodes.filter(isInViewport);
  const offScreen = allNodes.filter((el) => !isInViewport(el));
  const nodes = [...inView, ...offScreen].slice(0, MAX_CANDIDATES);

  const candidates: CandidateElement[] = nodes.map((node) => {
    const placeholder =
      (node as HTMLInputElement).placeholder?.trim() || node.getAttribute("placeholder")?.trim();
    const associatedLabel = getAssociatedLabel(node);
    return {
      selector: cssPath(node),
      role: node.getAttribute("role") ?? node.tagName.toLowerCase(),
      text: (node.innerText || node.getAttribute("name") || "").trim().slice(0, 120),
      placeholder: placeholder || undefined,
      label: associatedLabel || undefined,
    };
  });

  const textPreview = document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 1500);

  return {
    url: window.location.href,
    title: document.title,
    textPreview,
    candidates,
  };
}
