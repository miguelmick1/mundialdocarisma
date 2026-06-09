import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1)
});

const serverSchema = z.object({
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().email(),
  FIREBASE_PRIVATE_KEY: z.string().min(1),
  FIREBASE_STORAGE_BUCKET: z.string().min(1),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().default("miguelmickelberg@gmail.com"),
  BOOTSTRAP_ADMIN_NAME: z.string().min(2).max(60).default("Miguel Mickelberg"),
  MAX_ACTIVE_ADMINS: z.coerce.number().int().min(1).max(10).default(2),
  SESSION_DAYS: z.coerce.number().int().min(1).max(14).default(5),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_SECRET: z.string().min(32),
  API_FOOTBALL_KEY: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().min(10).optional()
  )
});

export function getPublicEnv() {
  return publicSchema.parse({
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  });
}

export function getServerEnv() {
  return serverSchema.parse({
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
    FIREBASE_STORAGE_BUCKET:
      process.env.FIREBASE_STORAGE_BUCKET ??
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    BOOTSTRAP_ADMIN_EMAIL: process.env.BOOTSTRAP_ADMIN_EMAIL,
    BOOTSTRAP_ADMIN_NAME: process.env.BOOTSTRAP_ADMIN_NAME,
    MAX_ACTIVE_ADMINS: process.env.MAX_ACTIVE_ADMINS,
    SESSION_DAYS: process.env.SESSION_DAYS,
    APP_URL: process.env.APP_URL,
    APP_SECRET: process.env.APP_SECRET,
    API_FOOTBALL_KEY: process.env.API_FOOTBALL_KEY
  });
}
