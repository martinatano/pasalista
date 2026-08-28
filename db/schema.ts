import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const businesses = sqliteTable("businesses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerUserId: text("owner_user_id"),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  whatsapp: text("whatsapp").notNull().default(""),
  logoKey: text("logo_key"),
  brandColor: text("brand_color").notNull().default("#fa7c4a"),
  minimumOrder: real("minimum_order").notNull().default(0),
  deliveryZones: text("delivery_zones").notNull().default(""),
  deliveryDays: text("delivery_days").notNull().default(""),
  plan: text("plan").notNull().default("trial"),
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  subscriptionStatus: text("subscription_status").notNull().default("trial"),
  mpPreapprovalId: text("mp_preapproval_id"),
  trialEndsAt: text("trial_ends_at"),
  currentPeriodEnd: text("current_period_end"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_businesses_slug").on(table.slug),
  index("idx_businesses_owner_user").on(table.ownerUserId),
]);

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  businessId: integer("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  detail: text("detail").notNull().default(""),
  category: text("category").notNull().default("General"),
  price: real("price").notNull(),
  stock: real("stock"),
  emoji: text("emoji").notNull().default("📦"),
  imageKey: text("image_key"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("idx_products_business_code").on(table.businessId, table.code)]);

export const imports = sqliteTable("imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  businessId: integer("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  productCount: integer("product_count").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_imports_business_created").on(table.businessId, table.createdAt)]);

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  businessId: integer("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull().default(""),
  deliveryAddress: text("delivery_address").notNull().default(""),
  notes: text("notes").notNull().default(""),
  total: real("total").notNull(),
  status: text("status").notNull().default("new"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_orders_business_created").on(table.businessId, table.createdAt)]);

export const orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productCode: text("product_code").notNull(),
  productName: text("product_name").notNull(),
  unitPrice: real("unit_price").notNull(),
  quantity: integer("quantity").notNull(),
}, (table) => [index("idx_order_items_order").on(table.orderId)]);

export const cancellationRequests = sqliteTable("cancellation_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  type: text("type").notNull().default("cancellation"),
  reason: text("reason").notNull().default(""),
  status: text("status").notNull().default("received"),
  confirmationCode: text("confirmation_code").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_cancellation_confirmation").on(table.confirmationCode),
  index("idx_cancellation_email_created").on(table.email, table.createdAt),
]);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: integer("window_start").notNull(),
  count: integer("count").notNull().default(0),
});
