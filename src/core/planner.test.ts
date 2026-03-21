import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planNextAction } from "./planner.ts";
import type { CandidateElement } from "../shared/contracts.ts";

const heuristic = { kind: "heuristic" as const };

function makeInput(goal: string, candidates: CandidateElement[] = [], history: string[] = []) {
  return {
    goal,
    snapshot: {
      url: "http://localhost/",
      title: "Test",
      textPreview: "",
      candidates
    },
    history
  };
}

const searchInput: CandidateElement = { selector: "#search", role: "input", text: "", placeholder: "Search" };
const submitBtn: CandidateElement   = { selector: "#submit", role: "button", text: "Submit" };

describe("heuristic planner — navigate", () => {
  it("extracts URL from goal", async () => {
    const { action } = await planNextAction(heuristic, makeInput("go to https://example.com"));
    assert.equal(action.type, "navigate");
    assert.equal((action as any).url, "https://example.com");
  });

  it("handles 'navigate to' prefix", async () => {
    const { action } = await planNextAction(heuristic, makeInput("navigate to https://foo.com"));
    assert.equal(action.type, "navigate");
  });
});

describe("heuristic planner — type / fill", () => {
  it("fills a named field", async () => {
    const { action } = await planNextAction(heuristic, makeInput('fill "Jane" in Search', [searchInput]));
    assert.equal(action.type, "type");
    assert.equal((action as any).text, "Jane");
    assert.equal((action as any).selector, "#search");
  });

  it("fills first input when no field hint matches", async () => {
    const { action } = await planNextAction(heuristic, makeInput('search for hello', [searchInput]));
    assert.equal(action.type, "type");
    assert.equal((action as any).selector, "#search");
  });
});

describe("heuristic planner — click", () => {
  it("clicks a button matching label", async () => {
    const { action } = await planNextAction(heuristic, makeInput("click Submit", [submitBtn]));
    assert.equal(action.type, "click");
    assert.equal((action as any).selector, "#submit");
  });
});

describe("heuristic planner — done fallback", () => {
  it("returns done when no candidates", async () => {
    const { action } = await planNextAction(heuristic, makeInput("do something", []));
    assert.equal(action.type, "done");
  });

  it("returns done when no input or button found in fallback path", async () => {
    const { action } = await planNextAction(
      heuristic,
      makeInput("do something unusual xyz", [], ["Typed into #name", "Clicked #submit"])
    );
    assert.equal(action.type, "done");
  });
});

describe("heuristic planner — PlannerResult shape", () => {
  it("always wraps action in PlannerResult", async () => {
    const result = await planNextAction(heuristic, makeInput("go to https://example.com"));
    assert.ok("action" in result, "result should have action field");
    assert.equal(result.action.type, "navigate");
  });

  it("heuristic planner has no reflection fields", async () => {
    const result = await planNextAction(heuristic, makeInput("go to https://example.com"));
    assert.equal(result.evaluation, undefined);
    assert.equal(result.memory, undefined);
    assert.equal(result.nextGoal, undefined);
  });
});
