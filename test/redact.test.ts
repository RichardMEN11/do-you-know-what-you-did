import { describe, expect, it } from "vitest";
import { redactSecrets } from "../src/redact";

describe("redactSecrets", () => {
  it("redacts private keys and AWS keys", () => {
    const input = [
      "-----BEGIN PRIVATE KEY-----",
      "abc",
      "-----END PRIVATE KEY-----",
      "AKIA1234567890ABCD12"
    ].join("\n");
    const output = redactSecrets(input);
    expect(output).toContain("[REDACTED PRIVATE KEY]");
    expect(output).not.toContain("AKIA1234567890ABCD12");
  });

  it("redacts key=value style secrets and bearer tokens", () => {
    const input = [
      "api_key=secret123",
      "token: supersecret",
      "authorization: bearer abc.def.ghi"
    ].join("\n");
    const output = redactSecrets(input);
    expect(output).toContain("api_key=REDACTED");
    expect(output).toContain("token=REDACTED");
    expect(output).toContain("authorization: bearer REDACTED");
  });
});
