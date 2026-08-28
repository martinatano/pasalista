import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { businesses } from "@/db/schema";
import { authenticatedUserId } from "./auth";

export async function ownedBusiness(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return null;
  const owned = await getDb().select().from(businesses).where(eq(businesses.ownerUserId, userId)).orderBy(asc(businesses.id));
  if (!owned.length) return null;
  const requestedId = Number(request.headers.get("x-pasalista-catalog-id"));
  return owned.find((business) => business.id === requestedId) ?? owned[0];
}
