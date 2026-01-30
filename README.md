# do-you-know-what-you-did

Push code. Get a pop quiz. Live your best life.

This is a Git pre-push hook that asks you 3 multiple‑choice questions about **your actual diff**. If you can’t answer at least 2, the push gets benched. It’s like a seatbelt for “wait, what did I change again?” moments.

## Why this exists (AI edition)

We vibe‑code. AI vibes back. And sometimes nobody knows what *actually* changed.

This tool exists to:
- stop “ship it, idk what I did” moments
- make AI‑generated changes legible
- turn every push into a tiny learning moment

It’s less “gotcha” and more “wait, what did the model do?”

## Quick Start

```bash
npm install
npm run build
npm link
do-you-know-what-you-did install
```

## The Magic Ingredient

```bash
# Put this in .env (repo root)
OPENAI_API_KEY=... # required
# optional for OpenAI-compatible providers
OPENAI_BASE_URL=https://api.openai.com/v1
```

## Run It By Hand (for fun or debugging)

```bash
do-you-know-what-you-did run
```

## I Am In A Hurry (the escape hatch)

```bash
git push --no-verify
```

## Configuration (make it your vibe)

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

## Cache (fewer API calls, more snacks)

Generated quizzes are cached at `.git/do-you-know-what-you-did-cache.json` and reused for repeat pushes of the same commit range.
