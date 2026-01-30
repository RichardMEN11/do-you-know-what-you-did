import { z } from "zod";

export const questionSchema = z.object({
  id: z.enum(["q1", "q2", "q3"]),
  question: z.string().min(1),
  options: z.object({
    A: z.string().min(1),
    B: z.string().min(1),
    C: z.string().min(1),
    D: z.string().min(1)
  }),
  correct: z.enum(["A", "B", "C", "D"]),
  explanation: z.string().min(1)
});

export const quizSchema = z
  .object({
    version: z.literal(1),
    questions: z.array(questionSchema).length(3)
  })
  .superRefine((data, ctx) => {
    const ids = data.questions.map((q) => q.id);
    const expected = ["q1", "q2", "q3"];
    if (ids.join(",") !== expected.join(",")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "questions must be ordered with ids q1, q2, q3"
      });
    }
  });

export type Quiz = z.infer<typeof quizSchema>;
