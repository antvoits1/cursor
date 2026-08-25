import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractFields, extractContacts } from "./fields.ts";

describe("extractFields", () => {
  it("pulls labeled values from document text", () => {
    const text = [
      "Name: Jordan Lee",
      "Policy Number: AA-20481",
      "Effective Date = 2026-08-21",
      "https://example.com should be ignored as a key",
      "Notes: Keep the original wording.",
    ].join("\n");

    const fields = extractFields(text);
    assert.deepEqual(fields, [
      { key: "Name", value: "Jordan Lee" },
      { key: "Policy Number", value: "AA-20481" },
      { key: "Effective Date", value: "2026-08-21" },
      { key: "Notes", value: "Keep the original wording." },
    ]);
  });

  it("finds emails and phone numbers", () => {
    const found = extractContacts("Write press@example.com or call +1 415-555-0199 today.");
    assert.deepEqual(found.emails, ["press@example.com"]);
    assert.ok(found.phones.some((phone) => phone.includes("415")));
  });
});
