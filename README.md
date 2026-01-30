# do-you-know-what-you-did

Git pre-push quiz that asks 3 multiple-choice questions about what you changed.

## Install

```bash
npm install
npm run build
npm link
```

## Configure environment

```bash
export OPENAI_API_KEY=... # required
# optional for OpenAI-compatible providers
export OPENAI_BASE_URL=https://api.openai.com/v1
```

## Install the hook

```bash
do-you-know-what-you-did install
```

## Run manually

```bash
do-you-know-what-you-did run
```

## Bypass

```bash
git push --no-verify
```

## Configuration

Create `.do-you-know-what-you-did.json` in the repo root:

```json
{
  "model": "gpt-4o-mini",
  "passScore": 2,
  "maxDiffChars": 25000,
  "allowFailOpen": true,
  "excludeFiles": ["**/*.lock", "dist/**"]
}
```

## Cache

The generated quiz is cached at `.git/do-you-know-what-you-did-cache.json` and reused for repeat pushes of the same commit range.
