// /server/api/blog/posts/status.put.ts
import { models } from "@b/db";

import { updateRecordResponses } from "@b/utils/query";

export const metadata: OperationObject = {
  summary: "Updates the status of a blog post identified by ID",
  description: "This endpoint updates the status of an existing blog post.",
  operationId: "updatePostStatus",
  tags: ["Blog"],
  requiresAuth: true,
  parameters: [
    {
      index: 0,
      name: "slug",
      in: "path",
      description: "The ID of the blog post to update its status",
      required: true,
      schema: {
        type: "string",
        description: "Post ID",
      },
    },
  ],
  requestBody: {
    required: true,
    description: "New status of the blog post",
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              description: "New status of the blog post",
              enum: ["PUBLISHED", "DRAFT"],
            },
          },
          required: ["status"],
        },
      },
    },
  },
  responses: updateRecordResponses("Post"),
};

export default async (data: Handler) => {
  // Consider calling cachePosts() if needed to update the cache
  return await updatePostStatus(data.params.slug, data.body.status);
};

export async function updatePostStatus(
  slug: string,
  status: PostStatus
): Promise<any> {
  await models.post.update({ status }, { where: { slug } });

  const post = await models.post.findOne({ where: { slug } });
  if (!post) throw new Error("Post not found");

  return post;
}
