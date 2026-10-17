import { z } from "zod";

// Schema for runtime environment variable validation
const envSchema = z.object({
  MONGODB_URI: z.string().optional().default(""),
  SESSION_SECRET: z
    .string()
    .min(16, "SESSION_SECRET must be at least 16 characters long")
    .default("super-secure-athletepulse-session-secret-key-32-chars-min"),
  AI_PROVIDER: z.string().optional().default("none"),
  GROQ_API_KEY: z.string().optional().default(""),
  OPENAI_API_KEY: z.string().optional().default(""),
  AI_MODEL: z.string().optional().default("llama-3.3-70b-versatile"),
  APP_URL: z.string().default("http://localhost:3000"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("Invalid environment variables:", parsedEnv.error.format());
  throw new Error("Invalid environment configuration");
}

export const env = parsedEnv.data;
