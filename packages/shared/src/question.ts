import { z } from 'zod';

export const OptionKeySchema = z.enum(['a', 'b', 'c', 'd']);
export type OptionKey = z.infer<typeof OptionKeySchema>;

export const ExcelQuestionRowSchema = z.object({
  topic: z.string().min(1, 'Topic is required'),
  subtopic: z.string().optional().default(''),
  question: z.string().min(1, 'Question body is required').max(4000, 'Question too long'),
  code: z.string().optional().default(''),
  code_lang: z.string().optional().default('python'),
  option_a: z.string().min(1, 'Option A is required').max(1000),
  option_b: z.string().min(1, 'Option B is required').max(1000),
  option_c: z.string().min(1, 'Option C is required').max(1000),
  option_d: z.string().min(1, 'Option D is required').max(1000),
  correct: z.string().transform(v => v.trim().toLowerCase()).pipe(OptionKeySchema),
  marks: z.coerce.number().positive().optional().default(1),
  negative: z.coerce.number().min(0).optional().default(0),
  explanation: z.string().optional().default('')
}).refine(data => {
  const options = [data.option_a, data.option_b, data.option_c, data.option_d];
  return new Set(options).size > 1;
}, {
  message: 'Options must not all be identical',
  path: ['option_a']
});

export type ExcelQuestionRow = z.infer<typeof ExcelQuestionRowSchema>;

export const CreateSubjectSchema = z.object({
  name: z.string().min(1, 'Subject name is required')
});
export type CreateSubjectInput = z.infer<typeof CreateSubjectSchema>;

export const QuestionFilterSchema = z.object({
  subjectId: z.string().uuid().optional(),
  topic: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20)
});
export type QuestionFilterInput = z.infer<typeof QuestionFilterSchema>;
