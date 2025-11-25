import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("companies").order("desc").take(100);
  },
});

export const save = mutation({
  args: {
    companyName: v.string(),
    websiteUrl: v.string(),
    domain: v.string(),
    rolesFound: v.boolean(),
    founders: v.array(v.string()),
    emails: v.array(v.string()),
    emailDraft: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("companies")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain))
      .first();

    if (existing) {
      if (existing.status === 'Contacted') return; // Don't overwrite if already contacted
      await ctx.db.patch(existing._id, {
        ...args,
        lastScannedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("companies", {
        ...args,
        status: "New",
        lastScannedAt: Date.now(),
      });
    }
  },
});

export const markContacted = mutation({
  args: {
    id: v.id("companies"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "Contacted" });
  },
});

export const blacklist = mutation({
  args: {
    id: v.id("companies"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "Blacklisted" });
  },
});

export const isContacted = query({
  args: { domain: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("companies")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain))
      .first();
    return existing?.status === "Contacted" || existing?.status === "Blacklisted";
  },
});

export const updateDraft = mutation({
  args: {
    id: v.id("companies"),
    draft: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { emailDraft: args.draft });
  },
});
