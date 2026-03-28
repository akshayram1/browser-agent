#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const MAX_TEXT_PREVIEW_LENGTH = 800;

// Keep this prompt in sync with src/core/prompt.ts DEFAULT_SYSTEM_PROMPT.
const DEFAULT_SYSTEM_PROMPT = [
  "You are OmniBrowser Agent, an on-page web automation planner.",
  "Choose exactly one next action using the provided page snapshot.",
  "",
  "Output rules:",
  '- Reply with only one valid JSON object (no markdown fences, no prose).',
  '- JSON shape must be: { "evaluation": string, "memory": string, "nextGoal": string, "action": AgentAction }.',
  '- Keep evaluation/memory/nextGoal concise but informative.',
  "",
  "Valid AgentAction shapes:",
  '- {"type":"click","selector":"<css>","label":"<optional>"}',
  '- {"type":"type","selector":"<css>","text":"<text>","clearFirst":true|false,"label":"<optional>"}',
  '- {"type":"navigate","url":"https://..."}',
  '- {"type":"extract","selector":"<css>","label":"<label>"}',
  '- {"type":"scroll","selector":"<optional css>","deltaY":number}',
  '- {"type":"focus","selector":"<css>"}',
  '- {"type":"wait","ms":number}',
  '- {"type":"done","reason":"<reason>"}',
  "",
  "IMPORTANT: You MUST use selectors exactly as listed in the candidates. NEVER invent or guess selectors.",
  "If you cannot find a matching candidate for a target element, use the closest match from the candidates list.",
  "When previous step failed, recover by trying a different candidate selector or fallback strategy."
].join("\n");

const PEOPLE = [
  "Jane Doe", "John Smith", "Priya Nair", "Carlos Vega", "Lena Fischer", "Mei Chen", "Ava Thompson", "Noah Patel",
  "Arjun Mehta", "Sofia Rossi", "Liam Turner", "Maya Brooks", "Omar Rahman", "Zoe Kim", "Ethan Park", "Fatima Ali"
];

const COMPANIES = [
  "Acme Labs", "Northwind", "Bluefin Tech", "Nimbus Health", "Atlas Freight", "Lumen Retail", "Orbit Analytics", "Riverbank Media",
  "Summit Cloud", "Vertex Legal", "Harbor Logistics", "Granite Finance", "Pulse Mobility", "Aurora Foods", "Meridian Bio", "Skyline Energy"
];

const CITIES = [
  "San Francisco", "Austin", "New York", "Chicago", "Seattle", "Boston", "Denver", "Miami",
  "Los Angeles", "Portland", "Atlanta", "Dallas", "Phoenix", "Philadelphia", "Nashville", "San Diego"
];

const PRODUCT_QUERIES = [
  "wireless mouse", "usb-c hub", "standing desk", "noise cancelling headphones",
  "webcam", "ergonomic chair", "4k monitor", "mechanical keyboard"
];

const DOC_TOPICS = [
  "refund policy", "invoice export", "api keys", "team permissions",
  "billing portal", "audit logs", "sso setup", "usage limits"
];

const URL_TARGETS = [
  "https://crm.example.com/contacts",
  "https://portal.example.com/settings",
  "https://help.example.com/docs",
  "https://app.example.com/dashboard",
  "https://shop.example.com/search",
  "https://support.example.com/tickets/new"
];

const DISTRACTOR_ROLES = ["button", "a", "input", "div", "textarea", "select"];
const DISTRACTOR_BUTTON_TEXT = ["Download CSV", "Open Settings", "Export", "Invite User", "Filter", "Refresh", "Help", "Share"];
const DISTRACTOR_LINK_TEXT = ["Billing", "Audit Trail", "Teams", "Workflows", "Templates", "Integrations", "Status Page"];
const DISTRACTOR_INPUT_LABELS = ["Internal note", "Search all", "Tag", "Region", "Label", "Comment", "Owner", "Department"];

function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick(list, rng) {
  return list[randInt(rng, 0, list.length - 1)];
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function shuffle(rng, list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randInt(rng, 0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function formatCandidate(candidate, index) {
  const parts = [
    `${candidate.role || "element"}`,
    `selector: ${JSON.stringify(candidate.selector)}`,
    `text: ${JSON.stringify(candidate.text || "")}`
  ];

  if (candidate.label) parts.push(`label: ${JSON.stringify(candidate.label)}`);
  if (candidate.placeholder) parts.push(`placeholder: ${JSON.stringify(candidate.placeholder)}`);

  return `[${index + 1}] ${parts.join(" | ")}`;
}

function buildUserMessage(input) {
  const { goal, snapshot, history, memory, lastError } = input;
  const candidates = snapshot.candidates.map(formatCandidate).join("\n");
  const historyLines = history.length > 0
    ? history.map((step, index) => `${index + 1}. ${step}`).join("\n")
    : "(none)";

  return [
    `Goal: ${goal}`,
    "",
    "Page snapshot:",
    `- URL: ${snapshot.url}`,
    `- Title: ${snapshot.title}`,
    `- Text preview (first ${MAX_TEXT_PREVIEW_LENGTH} chars): ${JSON.stringify(snapshot.textPreview.slice(0, MAX_TEXT_PREVIEW_LENGTH))}`,
    "",
    `Interactive candidates (${snapshot.candidates.length}):`,
    candidates || "(none)",
    "",
    "History:",
    historyLines,
    "",
    `Working memory: ${memory ? JSON.stringify(memory) : "(none)"}`,
    `Last error: ${lastError ? JSON.stringify(lastError) : "(none)"}`,
    "If Last error is present, recover and choose a different valid action."
  ].join("\n");
}

function makeRow(input, plannerResult) {
  return {
    messages: [
      { role: "system", content: DEFAULT_SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(input) },
      { role: "assistant", content: JSON.stringify(plannerResult) }
    ]
  };
}

function candidateWithDistractors(rng, baseCandidates, namespace) {
  const used = new Set(baseCandidates.map((c) => c.selector));
  const distractors = [];
  const distractorCount = randInt(rng, 6, 15);

  for (let i = 0; i < distractorCount; i += 1) {
    const role = pick(DISTRACTOR_ROLES, rng);
    let selector = "";
    let candidate = null;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const token = `${namespace}-x-${i}-${randInt(rng, 100, 99999)}`;
      selector = role === "a" ? `a[data-id="${token}"]` : `#${token}`;
      if (!used.has(selector)) break;
    }
    used.add(selector);

    if (role === "input") {
      const label = pick(DISTRACTOR_INPUT_LABELS, rng);
      candidate = { role, selector, text: "", label, placeholder: `${label}...` };
    } else if (role === "textarea") {
      const label = pick(DISTRACTOR_INPUT_LABELS, rng);
      candidate = { role, selector, text: "", label, placeholder: `Write ${label.toLowerCase()}` };
    } else if (role === "a") {
      candidate = { role, selector, text: pick(DISTRACTOR_LINK_TEXT, rng) };
    } else if (role === "button") {
      candidate = { role, selector, text: pick(DISTRACTOR_BUTTON_TEXT, rng) };
    } else if (role === "select") {
      candidate = { role, selector, text: pick(["Sort", "Status", "Plan", "Team"], rng), label: "Filter" };
    } else {
      candidate = { role, selector, text: pick(["Panel", "Widget", "Summary", "Info"], rng) };
    }

    distractors.push(candidate);
  }

  return shuffle(rng, [...baseCandidates, ...distractors]);
}

function actionToHistory(action) {
  switch (action.type) {
    case "click":
      return `Clicked ${action.selector}`;
    case "type":
      return `Typed ${JSON.stringify(action.text)} into ${action.selector}`;
    case "navigate":
      return `Navigated to ${action.url}`;
    case "extract":
      return `Extracted ${action.label} from ${action.selector}`;
    case "scroll":
      return `Scrolled ${action.selector || "page"} by ${action.deltaY}`;
    case "focus":
      return `Focused ${action.selector}`;
    case "wait":
      return `Waited ${action.ms}ms`;
    case "done":
      return `Marked done: ${action.reason}`;
    default:
      return "Completed action";
  }
}

function stepRow({ goal, state, snapshot, result, lastError }) {
  const row = makeRow(
    {
      goal,
      snapshot,
      history: [...state.history],
      memory: state.memory,
      lastError
    },
    result
  );

  state.history.push(actionToHistory(result.action));
  state.memory = result.memory;
  return row;
}

function makeCRMChain(rng, chainId) {
  const person = pick(PEOPLE, rng);
  const company = pick(COMPANIES, rng);
  const city = pick(CITIES, rng);
  const personSlug = slugify(person);
  const contactsURL = `https://crm.example.com/${slugify(company)}/contacts?region=${encodeURIComponent(city)}`;
  const dashboardURL = `https://app.example.com/${slugify(company)}/dashboard`;
  const searchSelector = pick(["#contact-search", "input[name='contactSearch']", "[data-agent='contact-search']"], rng);
  const rowSelector = `[data-contact="${personSlug}"] .view-profile`;
  const goal = `Find ${person} in contacts and open profile`;
  const state = { history: [], memory: undefined };

  const rows = [];

  rows.push(stepRow({
    goal,
    state,
    snapshot: {
      url: dashboardURL,
      title: `${company} Workspace`,
      textPreview: `${company} dashboard overview. Contacts live in the CRM tab. Operators in ${city} are active.`,
      candidates: candidateWithDistractors(rng, [
        { role: "a", selector: "#nav-contacts", text: "Contacts" },
        { role: "a", selector: "#nav-reports", text: "Reports" },
        { role: "button", selector: "#quick-create", text: "Quick Create" }
      ], `crm-${chainId}-s1`)
    },
    result: {
      evaluation: "Task started from dashboard where contacts are not visible yet.",
      memory: `Target contact is ${person}. Must open contacts first.`,
      nextGoal: "Navigate to contacts page.",
      action: { type: "navigate", url: contactsURL }
    }
  }));

  rows.push(stepRow({
    goal,
    state,
    snapshot: {
      url: contactsURL,
      title: `${company} CRM Contacts`,
      textPreview: `Contacts directory is loaded with filters and results table. Search can locate ${person}.`,
      candidates: candidateWithDistractors(rng, [
        { role: "input", selector: searchSelector, text: "", label: "Search contacts", placeholder: "Type name or email" },
        { role: "button", selector: "#search-submit", text: "Search" },
        { role: "button", selector: "#clear-filters", text: "Clear filters" },
        { role: "div", selector: "#contact-results", text: "Results" }
      ], `crm-${chainId}-s2`)
    },
    result: {
      evaluation: "Contacts page is open and search field is available.",
      memory: `Use ${searchSelector} to locate ${person}.`,
      nextGoal: "Focus the search input before typing.",
      action: { type: "focus", selector: searchSelector }
    }
  }));

  const appendMode = rng() < 0.45;
  const typedText = appendMode ? ` ${person.split(" ").slice(-1)[0]}` : person;
  const existingSearch = appendMode ? person.split(" ")[0] : "";

  rows.push(stepRow({
    goal,
    state,
    snapshot: {
      url: contactsURL,
      title: `${company} CRM Contacts`,
      textPreview: `Search is focused. Existing query: ${existingSearch || "(empty)"}. Contact rows update while typing.`,
      candidates: candidateWithDistractors(rng, [
        { role: "input", selector: searchSelector, text: existingSearch, label: "Search contacts", placeholder: "Type name or email" },
        { role: "button", selector: "#search-submit", text: "Search" },
        { role: "button", selector: "#bulk-actions", text: "Bulk actions" },
        { role: "a", selector: "#saved-views", text: "Saved views" }
      ], `crm-${chainId}-s3`)
    },
    result: {
      evaluation: "Search input is focused and ready for query update.",
      memory: `Searching contacts for ${person}.`,
      nextGoal: "Enter the contact name in the search field.",
      action: { type: "type", selector: searchSelector, text: typedText, clearFirst: !appendMode, label: "Search contacts" }
    }
  }));

  rows.push(stepRow({
    goal,
    state,
    snapshot: {
      url: `${contactsURL}&q=${encodeURIComponent(person)}`,
      title: `${company} CRM Contacts Results`,
      textPreview: `Filtered results show ${person} near the top with a View Profile action.`,
      candidates: candidateWithDistractors(rng, [
        { role: "button", selector: rowSelector, text: "View Profile" },
        { role: "button", selector: `[data-contact="${personSlug}"] .open-menu`, text: "More" },
        { role: "a", selector: `[data-contact="${personSlug}"] .company-link`, text: company },
        { role: "button", selector: "#search-submit", text: "Search" }
      ], `crm-${chainId}-s4`)
    },
    result: {
      evaluation: "Matching contact row is present in results.",
      memory: `Result for ${person} confirmed; profile button selector is ${rowSelector}.`,
      nextGoal: `Open ${person}'s profile.`,
      action: { type: "click", selector: rowSelector, label: "View Profile" }
    }
  }));

  rows.push(stepRow({
    goal,
    state,
    snapshot: {
      url: `https://crm.example.com/contacts/${personSlug}`,
      title: `${person} · ${company}`,
      textPreview: `${person} profile is open with contact details and recent activity feed.`,
      candidates: candidateWithDistractors(rng, [
        { role: "button", selector: "#edit-contact", text: "Edit contact" },
        { role: "button", selector: "#add-note", text: "Add note" },
        { role: "a", selector: "#back-to-contacts", text: "Back to contacts" }
      ], `crm-${chainId}-s5`)
    },
    result: {
      evaluation: "Profile is open and the goal has been completed.",
      memory: `${person} profile is currently active.`,
      nextGoal: "Finish the workflow.",
      action: { type: "done", reason: `Opened ${person} profile successfully.` }
    }
  }));

  return rows;
}

function makeCommerceChain(rng, chainId) {
  const query = pick(PRODUCT_QUERIES, rng);
  const city = pick(CITIES, rng);
  const company = pick(COMPANIES, rng);
  const goal = `Find ${query} and extract the top result price`;
  const state = { history: [], memory: undefined };
  const searchURL = `https://shop.example.com/search?market=${encodeURIComponent(city.toLowerCase())}`;
  const productSlug = slugify(query);

  const rows = [];

  rows.push(stepRow({
    goal,
    state,
    snapshot: {
      url: "https://shop.example.com/home",
      title: "Store Home",
      textPreview: `Storefront for ${city} with categories and promotions from ${company}.`,
      candidates: candidateWithDistractors(rng, [
        { role: "a", selector: "#nav-search", text: "Search" },
        { role: "a", selector: "#nav-cart", text: "Cart" },
        { role: "button", selector: "#accept-cookies", text: "Accept cookies" }
      ], `shop-${chainId}-s1`)
    },
    result: {
      evaluation: "Currently on storefront landing page.",
      memory: `Need search page to look up ${query}.`,
      nextGoal: "Navigate to search page.",
      action: { type: "navigate", url: searchURL }
    }
  }));

  rows.push(stepRow({
    goal,
    state,
    snapshot: {
      url: searchURL,
      title: "Search Products",
      textPreview: `Product search view loaded. Query can be entered in the search field.`,
      candidates: candidateWithDistractors(rng, [
        { role: "input", selector: "#search-query", text: "", label: "Search products", placeholder: "Search products" },
        { role: "button", selector: "#search-btn", text: "Search" },
        { role: "select", selector: "#sort-order", text: "Sort", label: "Sort by" }
      ], `shop-${chainId}-s2`)
    },
    result: {
      evaluation: "Search UI is ready for input.",
      memory: `Next enter query: ${query}.`,
      nextGoal: `Type ${query} in the search field.`,
      action: { type: "type", selector: "#search-query", text: query, clearFirst: true, label: "Search products" }
    }
  }));

  rows.push(stepRow({
    goal,
    state,
    snapshot: {
      url: `${searchURL}&q=${encodeURIComponent(query)}`,
      title: "Search Products",
      textPreview: `Query text is present. Results are not loaded until Search is clicked.`,
      candidates: candidateWithDistractors(rng, [
        { role: "button", selector: "#search-btn", text: "Search" },
        { role: "button", selector: "#clear-query", text: "Clear" },
        { role: "a", selector: "#advanced-filters", text: "Advanced filters" }
      ], `shop-${chainId}-s3`)
    },
    result: {
      evaluation: "Query entered; search request not submitted yet.",
      memory: `Query ${query} is ready.`,
      nextGoal: "Submit the search.",
      action: { type: "click", selector: "#search-btn", label: "Search" }
    }
  }));

  rows.push(stepRow({
    goal,
    state,
    snapshot: {
      url: `${searchURL}&q=${encodeURIComponent(query)}&pending=1`,
      title: "Searching...",
      textPreview: `Results request is in progress and spinner is visible.`,
      candidates: candidateWithDistractors(rng, [
        { role: "div", selector: "#results-spinner", text: "Loading results..." },
        { role: "button", selector: "#cancel-search", text: "Cancel" },
        { role: "div", selector: "#results-grid", text: "" }
      ], `shop-${chainId}-s4`)
    },
    result: {
      evaluation: "Search is processing and result cards are not stable yet.",
      memory: "Wait for results before extracting price.",
      nextGoal: "Pause briefly for search results to load.",
      action: { type: "wait", ms: randInt(rng, 700, 1800) }
    }
  }));

  rows.push(stepRow({
    goal,
    state,
    snapshot: {
      url: `${searchURL}&q=${encodeURIComponent(query)}`,
      title: "Search Results",
      textPreview: `Top result for ${query} is visible with rating and price.`,
      candidates: candidateWithDistractors(rng, [
        { role: "span", selector: `[data-product="${productSlug}"] .price`, text: `$${randInt(rng, 39, 399)}.99`, label: "Price" },
        { role: "a", selector: `[data-product="${productSlug}"] .name`, text: query },
        { role: "button", selector: `[data-product="${productSlug}"] .add-to-cart`, text: "Add to cart" }
      ], `shop-${chainId}-s5`)
    },
    result: {
      evaluation: "Results are loaded and top item price is visible.",
      memory: `Price selector identified for ${query}.`,
      nextGoal: "Extract the price text from the top result.",
      action: { type: "extract", selector: `[data-product="${productSlug}"] .price`, label: "top result price" }
    }
  }));

  return rows;
}

function makeDocsChain(rng, chainId) {
  const topic = pick(DOC_TOPICS, rng);
  const goal = `Find ${topic} in docs and stop when section is visible`;
  const state = { history: [], memory: undefined };
  const docsURL = `https://help.example.com/docs?from=${encodeURIComponent(slugify(topic))}`;
  const searchSelector = "#docs-search";

  const rows = [];

  rows.push(stepRow({
    goal,
    state,
    snapshot: {
      url: "https://help.example.com/",
      title: "Help Center Home",
      textPreview: "Help home page with docs, FAQ, and support links.",
      candidates: candidateWithDistractors(rng, [
        { role: "a", selector: "#nav-docs", text: "Documentation" },
        { role: "a", selector: "#nav-faq", text: "FAQ" },
        { role: "button", selector: "#open-chat", text: "Contact support" }
      ], `docs-${chainId}-s1`)
    },
    result: {
      evaluation: "Need to move from home page to docs area.",
      memory: `Goal topic is ${topic}.`,
      nextGoal: "Navigate to docs page.",
      action: { type: "navigate", url: docsURL }
    }
  }));

  rows.push(stepRow({
    goal,
    state,
    snapshot: {
      url: docsURL,
      title: "Documentation",
      textPreview: "Long docs page loaded. Relevant section may be below the fold.",
      candidates: candidateWithDistractors(rng, [
        { role: "div", selector: "#docs-scroll-container", text: "Main documentation body" },
        { role: "button", selector: "#toc-toggle", text: "Table of contents" },
        { role: "input", selector: searchSelector, text: "api", label: "Search docs", placeholder: "Search docs" }
      ], `docs-${chainId}-s2`)
    },
    result: {
      evaluation: "Docs content is visible but target section is not yet in viewport.",
      memory: `Need to locate ${topic} section.`,
      nextGoal: "Scroll down to reveal more sections.",
      action: { type: "scroll", selector: "#docs-scroll-container", deltaY: randInt(rng, 520, 980) }
    }
  }));

  rows.push(stepRow({
    goal,
    state,
    snapshot: {
      url: docsURL,
      title: "Documentation",
      textPreview: "After scrolling, search bar is available for precise section lookup.",
      candidates: candidateWithDistractors(rng, [
        { role: "input", selector: searchSelector, text: "api", label: "Search docs", placeholder: "Search docs" },
        { role: "button", selector: "#search-help", text: "Search" },
        { role: "a", selector: "#api-reference-link", text: "API Reference" }
      ], `docs-${chainId}-s3`)
    },
    result: {
      evaluation: "Search input is available and currently contains a partial query.",
      memory: "Append the remaining topic phrase in search field.",
      nextGoal: "Focus docs search input.",
      action: { type: "focus", selector: searchSelector }
    }
  }));

  const appendText = topic.startsWith("api") ? " keys" : ` ${topic}`;
  rows.push(stepRow({
    goal,
    state,
    snapshot: {
      url: docsURL,
      title: "Documentation",
      textPreview: "Cursor is in docs search with partial text already present.",
      candidates: candidateWithDistractors(rng, [
        { role: "input", selector: searchSelector, text: "api", label: "Search docs", placeholder: "Search docs" },
        { role: "button", selector: "#search-help", text: "Search" },
        { role: "button", selector: "#clear-search", text: "Clear" }
      ], `docs-${chainId}-s4`)
    },
    result: {
      evaluation: "Search field contains partial query and is focused.",
      memory: `Lookup query should include ${topic}.`,
      nextGoal: "Append text to complete the topic query.",
      action: { type: "type", selector: searchSelector, text: appendText, clearFirst: false, label: "Search docs" }
    }
  }));

  rows.push(stepRow({
    goal,
    state,
    snapshot: {
      url: `${docsURL}&q=${encodeURIComponent(topic)}`,
      title: "Documentation Search",
      textPreview: `Search results include a section titled ${topic}.`,
      candidates: candidateWithDistractors(rng, [
        { role: "a", selector: "#result-top-link", text: topic },
        { role: "button", selector: "#expand-result", text: "Expand" },
        { role: "div", selector: "#result-preview", text: `${topic} configuration details` }
      ], `docs-${chainId}-s5`)
    },
    result: {
      evaluation: "Relevant documentation result is visible for the topic.",
      memory: `Located ${topic} section in results.`,
      nextGoal: "Stop after confirming the section is found.",
      action: { type: "done", reason: `Located ${topic} section in docs.` }
    }
  }));

  return rows;
}

function makeLoginRecoveryChain(rng, chainId) {
  const person = pick(PEOPLE, rng);
  const company = pick(COMPANIES, rng);
  const goal = `Sign in to ${company} portal`;
  const state = { history: [], memory: undefined };
  const loginURL = `https://portal.example.com/${slugify(company)}/login`;
  const email = `${slugify(person).replace(/-/g, ".")}@${slugify(company)}.test`;

  const rows = [];

  rows.push(stepRow({
    goal,
    state,
    snapshot: {
      url: loginURL,
      title: `${company} Sign In`,
      textPreview: "Login form asks for email and password.",
      candidates: candidateWithDistractors(rng, [
        { role: "input", selector: "#email", text: "", label: "Email", placeholder: "you@company.com" },
        { role: "input", selector: "#password", text: "", label: "Password", placeholder: "Password" },
        { role: "button", selector: "#submit-login", text: "Continue" },
        { role: "button", selector: "#sign-in", text: "Sign in" }
      ], `auth-${chainId}-s1`)
    },
    result: {
      evaluation: "Login form is visible and email field is empty.",
      memory: `Account email is ${email}.`,
      nextGoal: "Type email into login form.",
      action: { type: "type", selector: "#email", text: email, clearFirst: true, label: "Email" }
    }
  }));

  rows.push(stepRow({
    goal,
    state,
    snapshot: {
      url: loginURL,
      title: `${company} Sign In`,
      textPreview: "Email is filled. Password is still empty.",
      candidates: candidateWithDistractors(rng, [
        { role: "input", selector: "#email", text: email, label: "Email", placeholder: "you@company.com" },
        { role: "input", selector: "#password", text: "", label: "Password", placeholder: "Password" },
        { role: "button", selector: "#submit-login", text: "Continue" },
        { role: "button", selector: "#sign-in", text: "Sign in" }
      ], `auth-${chainId}-s2`)
    },
    result: {
      evaluation: "Email is set; password remains empty.",
      memory: "Need to populate password before submitting.",
      nextGoal: "Type password.",
      action: { type: "type", selector: "#password", text: "P@ssw0rd!2026", clearFirst: true, label: "Password" }
    }
  }));

  rows.push(stepRow({
    goal,
    state,
    snapshot: {
      url: loginURL,
      title: `${company} Sign In`,
      textPreview: "Both credentials are present. There are two submit-like buttons.",
      candidates: candidateWithDistractors(rng, [
        { role: "button", selector: "#submit-login", text: "Continue" },
        { role: "button", selector: "#sign-in", text: "Sign in" },
        { role: "a", selector: "#forgot-password", text: "Forgot password?" },
        { role: "input", selector: "#remember-me", text: "", label: "Remember me" }
      ], `auth-${chainId}-s3`)
    },
    result: {
      evaluation: "Credentials are filled and form is ready to submit.",
      memory: "Try submitting once; fallback may be needed if button is disabled.",
      nextGoal: "Click the primary continue button.",
      action: { type: "click", selector: "#submit-login", label: "Continue" }
    }
  }));

  const row4 = stepRow({
    goal,
    state,
    snapshot: {
      url: loginURL,
      title: `${company} Sign In`,
      textPreview: "Continue button appears disabled while Sign in is active.",
      candidates: candidateWithDistractors(rng, [
        { role: "button", selector: "#submit-login", text: "Continue" },
        { role: "button", selector: "#sign-in", text: "Sign in" },
        { role: "div", selector: "#auth-error", text: "Please use Sign in button" }
      ], `auth-${chainId}-s4`)
    },
    lastError: "Previous click on #submit-login failed because the element was disabled.",
    result: {
      evaluation: "Previous submit attempt failed; alternate Sign in button is available.",
      memory: "Recover by clicking #sign-in instead.",
      nextGoal: "Click Sign in.",
      action: { type: "click", selector: "#sign-in", label: "Sign in" }
    }
  });
  rows.push(row4);

  rows.push(stepRow({
    goal,
    state,
    snapshot: {
      url: `${loginURL}?redirect=%2Fdashboard`,
      title: `${company} Loading...`,
      textPreview: "Authentication request sent and redirect is in progress.",
      candidates: candidateWithDistractors(rng, [
        { role: "div", selector: "#auth-spinner", text: "Signing in..." },
        { role: "button", selector: "#cancel-auth", text: "Cancel" },
        { role: "div", selector: "#progress", text: "Redirecting" }
      ], `auth-${chainId}-s5`)
    },
    result: {
      evaluation: "Sign-in request is processing.",
      memory: "Wait for auth redirect to complete.",
      nextGoal: "Pause briefly while authentication completes.",
      action: { type: "wait", ms: randInt(rng, 600, 1400) }
    }
  }));

  return rows;
}

const CHAIN_BUILDERS = [
  makeCRMChain,
  makeCommerceChain,
  makeDocsChain,
  makeLoginRecoveryChain
];

function parseArgs() {
  const requested = Number.parseInt(process.argv[2] || "320", 10);
  const count = Number.isFinite(requested) && requested > 0 ? requested : 320;
  const outPath = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.resolve(process.cwd(), "notebook/data/omnibrowser_planner_train.jsonl");
  const seedInput = Number.parseInt(process.argv[4] || "42", 10);
  const seed = Number.isFinite(seedInput) ? seedInput : 42;
  return { count, outPath, seed };
}

function main() {
  const { count, outPath, seed } = parseArgs();
  const rng = makeRng(seed);

  const rows = [];
  let chainId = 0;
  while (rows.length < count) {
    const builder = pick(CHAIN_BUILDERS, rng);
    const chainRows = builder(rng, chainId++);
    rows.push(...chainRows);
  }

  const finalRows = rows.slice(0, count);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, finalRows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");

  const actionCounts = new Map();
  const candidateCountStats = [];
  for (const row of finalRows) {
    const assistant = JSON.parse(row.messages[2].content);
    actionCounts.set(assistant.action.type, (actionCounts.get(assistant.action.type) || 0) + 1);

    const user = row.messages[1].content;
    const countMatch = user.match(/Interactive candidates \((\d+)\):/);
    if (countMatch) candidateCountStats.push(Number.parseInt(countMatch[1], 10));
  }

  const minCandidates = Math.min(...candidateCountStats);
  const maxCandidates = Math.max(...candidateCountStats);
  const avgCandidates = candidateCountStats.reduce((a, b) => a + b, 0) / candidateCountStats.length;

  console.log(`Wrote ${finalRows.length} rows to ${outPath}`);
  console.log(`Seed: ${seed}`);
  console.log(`Candidate counts: min=${minCandidates}, max=${maxCandidates}, avg=${avgCandidates.toFixed(2)}`);
  console.log("Action type distribution:");
  for (const [type, n] of [...actionCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`- ${type}: ${n}`);
  }
}

main();
