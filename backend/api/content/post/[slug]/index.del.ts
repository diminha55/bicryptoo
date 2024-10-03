// /server/api/blog/posts/delete.del.ts
import { models } from "@b/db";
import { createError } from "@b/utils/error";

import { deleteRecordResponses } from "@b/utils/query";

export const metadata: OperationObject = {
  summary: "Deletes a blog post identified by ID",
  description: "This endpoint deletes an existing blog post.",
  operationId: "deletePost",
  tags: ["Blog"],
  requiresAuth: true,
  parameters: [
    {
      index: 0,
      name: "slug",
      in: "path",
      description: "The ID of the blog post to delete",
      required: true,
      schema: {
        type: "string",
        description: "Post ID",
      },
    },
  ],
  responses: deleteRecordResponses("Post"),
};

export default async (data: Handler) => {
  if (!data.user?.id)
    throw createError({ statusCode: 401, message: "Unauthorized" });
  // Consider calling cachePosts() if needed to update the cache
  return await deletePost(data.user.id, data.params.slug);
};

export async function deletePost(userId: string, slug: string): Promise<any> {
  const author = await models.author.findOne({
    where: { userId: userId },
  });

  if (!author) {
    throw new Error("Author not found.");
  }

  return await models.post.destroy({
    where: { slug, authorId: author.id },
  });
}
