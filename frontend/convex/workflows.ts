import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== identity.subject) return null;
    return await ctx.db
      .query("workflows")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();
  },
});

export const save = mutation({
  args: {
    projectId: v.id("projects"),
    nodes: v.string(),
    edges: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== identity.subject)
      throw new Error("Not found");
    const workflow = await ctx.db
      .query("workflows")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();
    const now = Date.now();
    if (workflow) {
      await ctx.db.patch(workflow._id, {
        nodes: args.nodes,
        edges: args.edges,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("workflows", {
        projectId: args.projectId,
        nodes: args.nodes,
        edges: args.edges,
        updatedAt: now,
      });
    }
    await ctx.db.patch(args.projectId, { updatedAt: now });
  },
});
