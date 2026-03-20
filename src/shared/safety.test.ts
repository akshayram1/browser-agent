import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assessRisk } from "./safety.ts";

describe("assessRisk", () => {
  describe("navigate", () => {
    it("allows http URLs", () => {
      assert.equal(assessRisk({ type: "navigate", url: "http://example.com" }), "safe");
    });

    it("allows https URLs", () => {
      assert.equal(assessRisk({ type: "navigate", url: "https://example.com/path?q=1" }), "safe");
    });

    it("blocks javascript: protocol", () => {
      assert.equal(assessRisk({ type: "navigate", url: "javascript:alert(1)" }), "blocked");
    });

    it("blocks file: protocol", () => {
      assert.equal(assessRisk({ type: "navigate", url: "file:///etc/passwd" }), "blocked");
    });

    it("blocks malformed URLs", () => {
      assert.equal(assessRisk({ type: "navigate", url: "not a url" }), "blocked");
    });
  });

  describe("click", () => {
    it("is safe for neutral labels", () => {
      assert.equal(assessRisk({ type: "click", selector: "#btn", label: "Search" }), "safe");
    });

    it("requires review for risky labels", () => {
      assert.equal(assessRisk({ type: "click", selector: "#btn", label: "Delete account" }), "review");
      assert.equal(assessRisk({ type: "click", selector: "#btn", label: "Confirm purchase" }), "review");
      assert.equal(assessRisk({ type: "click", selector: "#btn", label: "Submit" }), "review");
    });

    it("is safe with no label", () => {
      assert.equal(assessRisk({ type: "click", selector: "#btn" }), "safe");
    });
  });

  describe("type", () => {
    it("is safe for neutral labels", () => {
      assert.equal(assessRisk({ type: "type", selector: "#input", text: "hello", label: "Search box" }), "safe");
    });

    it("requires review for risky labels", () => {
      assert.equal(assessRisk({ type: "type", selector: "#input", text: "x", label: "Transfer amount" }), "review");
    });
  });

  describe("other actions", () => {
    it("scroll is safe", () => {
      assert.equal(assessRisk({ type: "scroll", deltaY: 300 }), "safe");
    });

    it("wait is safe", () => {
      assert.equal(assessRisk({ type: "wait", ms: 500 }), "safe");
    });

    it("focus is safe", () => {
      assert.equal(assessRisk({ type: "focus", selector: "#el" }), "safe");
    });

    it("extract requires review", () => {
      assert.equal(assessRisk({ type: "extract", selector: "#el", label: "value" }), "review");
    });

    it("done is safe", () => {
      assert.equal(assessRisk({ type: "done", reason: "finished" }), "safe");
    });
  });
});
