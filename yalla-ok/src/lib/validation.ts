import { z } from "zod";
import { normalizeWhatsapp } from "@/lib/whatsapp";

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

import { DESCRIPTION_MAX, HEADLINE_MAX } from "@/lib/limits";
export { DESCRIPTION_MAX, HEADLINE_MAX };

export const taskSchema = z.object({
  headline: z
    .string()
    .transform(clean)
    .pipe(z.string().min(3, "Headline must be at least 3 characters.").max(HEADLINE_MAX, `Headline must be ${HEADLINE_MAX} characters or less.`)),
  description: z
    .string()
    .transform(clean)
    .pipe(z.string().min(1, "Add a short description.").max(DESCRIPTION_MAX, `Description must be ${DESCRIPTION_MAX} characters or less.`)),
  reward: z
    .string()
    .transform((s) => s.replace(/[$,\s]/g, ""))
    .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter the reward in USD, e.g. 20 or 7.50."))
    .transform((s) => Math.round(parseFloat(s) * 100))
    .pipe(z.number().int().min(1, "The reward must be more than $0.").max(10_000_000, "That reward is too high.")),
  location: z
    .string()
    .transform(clean)
    .pipe(z.string().min(2, "Add a city or neighbourhood.").max(60, "Location must be 60 characters or less.")),
  whatsapp: z
    .string()
    .transform((s) => normalizeWhatsapp(s))
    .refine((v): v is string => v !== null, "Enter your WhatsApp number with the country code, e.g. +961 70 123 456."),
  duration: z.coerce.number().int().positive("Choose a deadline."),
  client_token: z.uuid(),
});

export type TaskInput = z.infer<typeof taskSchema>;

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please check the form.";
}
