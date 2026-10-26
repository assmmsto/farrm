import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const authSchema = z.object({
  baseUrl: z.string().trim().min(8).max(300),
  apiKey: z.string().trim().min(1).max(2000),
});

const askSchema = z.object({
  baseUrl: z.string().trim().min(8).max(300),
  apiKey: z.string().trim().min(1).max(2000),
  model: z.string().trim().min(1).max(200),
  task: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("lab"),
      compounds: z.array(z.string().trim().min(1).max(80)).min(2).max(6),
      note: z.string().trim().max(500).optional(),
    }),
    z.object({
      kind: z.literal("card"),
      name: z.string().trim().min(1).max(120),
    }),
  ]),
});

const failed = { ok: false as const, error: "network", detail: null as string | null };

export const listProviderModels = createServerFn({ method: "POST" })
  .validator(authSchema)
  .handler(async ({ data }) => {
    try {
      const { listModelsUpstream } = await import("./provider.server");
      return await listModelsUpstream(data.baseUrl, data.apiKey);
    } catch {
      return failed;
    }
  });

export const askPharmacy = createServerFn({ method: "POST" })
  .validator(askSchema)
  .handler(async ({ data }) => {
    try {
      const { askUpstream } = await import("./provider.server");
      return await askUpstream(data);
    } catch {
      return failed;
    }
  });
