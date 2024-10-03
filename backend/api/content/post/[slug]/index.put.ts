// /server/api/blog/posts/update.put.ts
import { slugify } from "@b/utils";
import { models, sequelize } from "@b/db";
import { createError } from "@b/utils/error";
import { tagAttributes } from "@db/tag";

import { updateRecordResponses } from "@b/utils/query";

export const metadata: OperationObject = {
  summary: "Updates a blog post identified by slug",
  description: "This endpoint updates an existing blog post.",
  operationId: "updatePost",
  tags: ["Blog"],
  requiresAuth: true,
  parameters: [
    {
      index: 0,
      name: "slug",
      in: "path",
      description: "The slug of the blog post to update",
      required: true,
      schema: {
        type: "string",
        description: "Post Slug",
      },
    },
  ],
  requestBody: {
    required: true,
    description: "Updated blog post data",
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Title of the post" },
            content: { type: "string", description: "Content of the post" },
            description: {
              type: "string",
              description: "Description of the post",
            },
            categoryId: {
              type: "string",
              description: "Category ID for the post",
            },
            status: {
              type: "string",
              description: "New status of the blog post",
              enum: ["PUBLISHED", "DRAFT"],
            },
            tags: {
              type: "array",
              description: "Array of tag names associated with the post",
              items: {
                type: "string",
              },
            },
            image: {
              type: "string",
              description: "Image URL for the post",
            },
          },
          required: ["title", "content", "categoryId", "status"],
        },
      },
    },
  },
  responses: updateRecordResponses("Post"),
};

export default async (data) => {
  const { user, params, body } = data;

  if (!user?.id)
    throw createError({ statusCode: 401, message: "Unauthorized" });

  const { slug } = params;
  const { content, tags, category, description, title, status } = body;

  return await sequelize
    .transaction(async (transaction) => {
      // Find the author by user ID
      const author = await models.author.findOne({
        where: { userId: user.id },
        transaction,
      });
      if (!author) throw new Error("Author not found.");

      // Check if the post exists
      const existingPost = await models.post.findOne({
        where: { slug, authorId: author.id },
        include: [{ model: models.postTag, as: "postTags" }],
        transaction,
      });

      if (!existingPost)
        throw new Error(
          "Post not found or you don't have permission to edit it."
        );

      // Update the post fields
      existingPost.title = title;
      existingPost.content = content;
      existingPost.description = description;
      existingPost.status = status;
      existingPost.image = body.image;

      // Save the post
      await existingPost.save();

      // Update the category if provided
      if (category) {
        await existingPost.setCategory(category, { transaction });
      }

      // Update tags if provided
      if (tags) {
        await updateTags(existingPost, tags, transaction);
      }

      return {
        message: "Post updated successfully",
      };
    })
    .catch((error) => {
      throw error; // Rethrow error to handle it, e.g., send a response to the client
    });
};

async function updateTags(existingPost, tags, transaction) {
  // Remove existing tags
  await models.postTag.destroy({
    where: { postId: existingPost.id },
    transaction,
  });

  const tagInstances: tagAttributes[] = [];

  for (const tagName of tags) {
    const tagSlug = slugify(tagName.toLowerCase());

    // Check if the tag exists by slug
    let tag = await models.tag.findOne({
      where: { slug: tagSlug },
      transaction,
    });

    if (!tag) {
      tag = await models.tag.create(
        {
          name: tagName,
          slug: tagSlug,
        },
        { transaction }
      );
    }

    tagInstances.push(tag);
  }

  // Associate the tags with the post
  await models.postTag.bulkCreate(
    tagInstances.map((tag) => ({
      postId: existingPost.id,
      tagId: tag.id,
    })),
    { transaction }
  );
}
