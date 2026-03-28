#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const VALID_TYPES = new Set(["click", "type", "navigate", "extract", "scroll", "focus", "wait", "done"]);
const SELECTOR_REQUIRED_TYPES = new Set(["click", "type", "extract", "focus"]);

function parseArgs() {
  const inPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(process.cwd(), "notebook/data/omnibrowser_planner_train.jsonl");
  return { inPath };
}

function extractSelectorsFromUserMessage(text) {
  const selectors = new Set();
  for (const line of text.split("\n")) {
    const match = line.match(/selector:\s*("(?:\\.|[^"])*")/);
    if (!match) continue;
    try {
      const selector = JSON.parse(match[1]);
      if (typeof selector === "string") selectors.add(selector);
    } catch {
      // ignore malformed selector lines here; higher-level validation will catch issues.
    }
  }
  return selectors;
}

function validateAssistantObject(parsed, selectors) {
  const errors = [];

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    errors.push("assistant content must parse into a JSON object");
    return errors;
  }

  for (const field of ["evaluation", "memory", "nextGoal"]) {
    if (typeof parsed[field] !== "string") {
      errors.push(`missing or non-string top-level field: ${field}`);
    }
  }

  if (typeof parsed.action !== "object" || parsed.action === null || Array.isArray(parsed.action)) {
    errors.push("missing or invalid action object");
    return errors;
  }

  const action = parsed.action;
  if (typeof action.type !== "string" || !VALID_TYPES.has(action.type)) {
    errors.push(`unknown or missing action.type: ${String(action.type)}`);
    return errors;
  }

  if (SELECTOR_REQUIRED_TYPES.has(action.type)) {
    if (typeof action.selector !== "string") {
      errors.push(`action ${action.type} requires selector`);
    } else if (!selectors.has(action.selector)) {
      errors.push(`action.selector '${action.selector}' not present in candidates list`);
    }
  }

  if (action.type === "type" && typeof action.text !== "string") {
    errors.push("action type requires text");
  }
  if (action.type === "navigate" && typeof action.url !== "string") {
    errors.push("navigate action requires url");
  }
  if (action.type === "extract" && typeof action.label !== "string") {
    errors.push("extract action requires label");
  }
  if (action.type === "scroll" && typeof action.deltaY !== "number") {
    errors.push("scroll action requires numeric deltaY");
  }
  if (action.type === "wait" && typeof action.ms !== "number") {
    errors.push("wait action requires numeric ms");
  }
  if (action.type === "done" && typeof action.reason !== "string") {
    errors.push("done action requires reason");
  }

  return errors;
}

function validateLine(line, lineNo) {
  const issues = [];
  let row;

  try {
    row = JSON.parse(line);
  } catch (error) {
    return [`line ${lineNo}: invalid JSONL row (${String(error)})`];
  }

  if (!row || typeof row !== "object" || !Array.isArray(row.messages) || row.messages.length !== 3) {
    return [`line ${lineNo}: row.messages must be an array of length 3`];
  }

  const [systemMsg, userMsg, assistantMsg] = row.messages;
  if (systemMsg?.role !== "system" || typeof systemMsg?.content !== "string") {
    issues.push(`line ${lineNo}: message[0] must be system with string content`);
  }
  if (userMsg?.role !== "user" || typeof userMsg?.content !== "string") {
    issues.push(`line ${lineNo}: message[1] must be user with string content`);
  }
  if (assistantMsg?.role !== "assistant" || typeof assistantMsg?.content !== "string") {
    issues.push(`line ${lineNo}: message[2] must be assistant with string content`);
  }
  if (issues.length > 0) return issues;

  const assistantRaw = assistantMsg.content.trim();
  if (!(assistantRaw.startsWith("{") && assistantRaw.endsWith("}"))) {
    issues.push(`line ${lineNo}: assistant content must be a single JSON object string with no prose`);
    return issues;
  }

  let parsedAssistant;
  try {
    parsedAssistant = JSON.parse(assistantRaw);
  } catch (error) {
    issues.push(`line ${lineNo}: assistant content is not valid JSON (${String(error)})`);
    return issues;
  }

  const selectors = extractSelectorsFromUserMessage(userMsg.content);
  for (const issue of validateAssistantObject(parsedAssistant, selectors)) {
    issues.push(`line ${lineNo}: ${issue}`);
  }

  return issues;
}

function main() {
  const { inPath } = parseArgs();
  if (!fs.existsSync(inPath)) {
    console.error(`Dataset file not found: ${inPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(inPath, "utf8");
  const lines = raw.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    console.error(`Dataset is empty: ${inPath}`);
    process.exit(1);
  }

  const allIssues = [];
  const actionCounts = new Map();

  for (let i = 0; i < lines.length; i += 1) {
    const issues = validateLine(lines[i], i + 1);
    allIssues.push(...issues);

    if (issues.length === 0) {
      const parsed = JSON.parse(lines[i]);
      const actionType = JSON.parse(parsed.messages[2].content).action.type;
      actionCounts.set(actionType, (actionCounts.get(actionType) || 0) + 1);
    }
  }

  console.log(`Validated ${lines.length} rows from ${inPath}`);
  console.log("Action type distribution (valid rows):");
  for (const [type, n] of [...actionCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`- ${type}: ${n}`);
  }

  if (allIssues.length > 0) {
    console.error(`\nFound ${allIssues.length} issue(s):`);
    for (const issue of allIssues.slice(0, 40)) {
      console.error(`- ${issue}`);
    }
    if (allIssues.length > 40) {
      console.error(`- ... and ${allIssues.length - 40} more`);
    }
    process.exit(1);
  }

  console.log("\nDataset validation passed.");
}

main();
