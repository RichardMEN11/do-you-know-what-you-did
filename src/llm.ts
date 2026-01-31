import { quizSchema, Quiz } from './schema';
import { Config } from './types';

export async function callLLM(
  prompt: string,
  config: Config,
  debug = false,
): Promise<Quiz> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

  const system =
    'You are a code review assistant. Generate exactly 3 multiple-choice questions about the diff. The goal is to check if the developer really understood what they did.' +
    'Return JSON only matching the provided schema. Each explanation must mention a filename and what changed.';

  let lastError: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const messages = [
      { role: 'system', content: system },
      {
        role: 'user',
        content:
          `Return JSON that matches this schema strictly:\n` +
          `{\n  \"version\": 1,\n  \"questions\": [\n    {\n      \"id\": \"q1\",\n      \"question\": \"string\",\n      \"options\": { \"A\": \"string\", \"B\": \"string\", \"C\": \"string\", \"D\": \"string\" },\n      \"correct\": \"A\",\n      \"explanation\": \"string\"\n    }\n  ]\n}\n\n` +
          `Constraints:\n- questions.length must be 3\n- ids are q1, q2, q3\n- correct is one of A|B|C|D\n- explanation must cite filename + what changed\n` +
          (lastError
            ? `\nThe previous output failed because: ${lastError}\n`
            : '') +
          `\nHere is the diff context:\n${prompt}`,
      },
    ];

    const body = {
      model: config.model,
      messages,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LLM request failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as any;
    const content = data?.choices?.[0]?.message?.content;
    if (debug)
      console.error(
        `[debug] LLM raw content: ${String(content).slice(0, 2000)}`,
      );

    try {
      const parsed = JSON.parse(content);
      const quiz = quizSchema.parse(parsed);
      return quiz;
    } catch (err) {
      lastError = (err as Error).message;
      if (debug) console.error(`[debug] Validation error: ${lastError}`);
    }
  }

  throw new Error(lastError || 'LLM response invalid');
}
