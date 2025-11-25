import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  companies: defineTable({
    companyName: v.string(),
    websiteUrl: v.string(),
    domain: v.string(),
    rolesFound: v.boolean(),
    founders: v.array(v.string()),
    emails: v.array(v.string()),
    emailDraft: v.string(),
    status: v.optional(v.string()), // 'New', 'Contacted', 'Skipped'
    lastScannedAt: v.number(),
  }).index("by_domain", ["domain"]),
});
