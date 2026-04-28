import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  projects: defineTable({
    userId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_updated", ["userId", "updatedAt"]),

  workflows: defineTable({
    projectId: v.id("projects"),
    nodes: v.string(),
    edges: v.string(),
    updatedAt: v.number(),
  }).index("by_project", ["projectId"]),
});
