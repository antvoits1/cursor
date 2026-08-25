import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { unwrapSearchUrl, isPublicHttpUrl } from "./web.ts";

describe("unwrapSearchUrl", () => {
  it("unwraps DuckDuckGo redirect links", () => {
    const href = "//duckduckgo.com/l/?uddg=https%3A%2F%2Fopensource.org%2F";
    assert.equal(unwrapSearchUrl(href), "https://opensource.org/");
  });

  it("unwraps Bing encoded result links", () => {
    const encoded = Buffer.from("https://opensource.org/").toString("base64");
    const href = `https://www.bing.com/ck/a?u=a1${encoded}`;
    assert.equal(unwrapSearchUrl(href), "https://opensource.org/");
  });
});

describe("isPublicHttpUrl", () => {
  it("allows public https pages", () => {
    assert.equal(isPublicHttpUrl("https://example.com/about"), true);
  });

  it("blocks localhost and private addresses", () => {
    assert.equal(isPublicHttpUrl("http://127.0.0.1/secret"), false);
    assert.equal(isPublicHttpUrl("http://192.168.1.8/admin"), false);
    assert.equal(isPublicHttpUrl("file:///etc/passwd"), false);
  });
});
