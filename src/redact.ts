export function redactSecrets(input: string): string {
  let text = input;
  text = text.replace(
    /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g,
    "[REDACTED PRIVATE KEY]"
  );
  text = text.replace(/AKIA[0-9A-Z]{16}/g, "REDACTED_AWS_ACCESS_KEY");
  text = text.replace(
    /(api[_-]?key|token|secret|password)\s*[:=]\s*([^\s'"`]+)/gi,
    (_m, key) => `${key}=REDACTED`
  );
  text = text.replace(
    /(aws_secret_access_key)\s*[:=]\s*([^\s'"`]+)/gi,
    (_m, key) => `${key}=REDACTED`
  );
  text = text.replace(
    /authorization\s*:\s*bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
    "authorization: bearer REDACTED"
  );
  return text;
}
