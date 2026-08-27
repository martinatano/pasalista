export type DevPlan = "trial" | "simple" | "negocio" | "expired";

export function devPlanFrom(request: Request): DevPlan | null {
  const hostname = new URL(request.url).hostname;
  if (hostname !== "localhost" && hostname !== "127.0.0.1") return null;
  const value = request.headers.get("x-pasalista-dev-plan");
  return value === "trial" || value === "simple" || value === "negocio" || value === "expired" ? value : null;
}

