import { z } from "zod";

// Refresh tokens are opaque; Supabase validates authenticity, not an app-defined minimum length.
export const authSessionInput = z.object({
  accessToken: z.string().trim().min(1).max(16_384),
  refreshToken: z.string().trim().min(1).max(4_096),
});
