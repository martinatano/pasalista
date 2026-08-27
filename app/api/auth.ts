import { verifyToken } from "@clerk/backend";

export async function authenticatedUserId(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !process.env.CLERK_SECRET_KEY) return null;
  try {
    const verified = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    return typeof verified.sub === "string" ? verified.sub : null;
  } catch {
    return null;
  }
}
