// /server/api/blog/posts/store.post.ts
import { models, sequelize } from "@b/db";
import { createError } from "@b/utils/error";

import { createRecordResponses } from "@b/utils/query";

export const metadata: OperationObject = {
  summary: "Creates a new blog post",
  description: "This endpoint creates a new blog post.",
  operationId: "createPost",
  tags: ["Blog"],
  requiresAuth: true,
  requestBody: {
    required: true,
    description: "Blog post data",
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Title of the blog post" },
            content: {
              type: "string",
              description: "Content of the blog post",
            },
            categoryId: {
              type: "string",
              description: "ID of the category the post belongs to",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "IDs of the tags associated with the post",
            },
            status: {
              type: "string",
              description: "Status of the blog post",
              enum: ["PUBLISHED", "DRAFT", "TRASH"],
            },
            // Additional properties as needed for a blog post
          },
          required: ["title", "content", "categoryId", "status"],
        },
      },
    },
  },
  responses: createRecordResponses("Post"),
};

export default async (data: Handler) => {
  if (!data.user?.id)
    throw createError({ statusCode: 401, message: "Unauthorized" });
  // Consider calling cachePosts() if needed to update the cache
  return await createPost(data.user.id, data.body.post);
};

export async function createPost(userId: string, data: any): Promise<any> {
  return sequelize
    .transaction(async (transaction) => {
      // Assuming that the `author` is already associated with a `user`
      const author = await models.author.findOne({
        where: { userId },
        transaction,
      });
      if (!author) {
        throw new Error("Author not found.");
      }

      // Destructure and prepare postData
      const { tags, category, ...postData } = data;
      const slug = await createSlug(postData.title); // Assuming createSlug is an async function that generates a slug

      // Create the post instance
      const newPost = await models.post.create(
        {
          ...postData,
          slug,
          authorId: author.id,
          categoryId: category,
        },
        { transaction }
      );

      // If tags are provided, associate them with the newly created post
      if (tags && tags.length > 0) {
        // Assuming there is a method to add multiple tags, similar to addTag, provided by Sequelize after defining many-to-many relation
        // You might need to adjust this part depending on how your many-to-many relationship is set up
        for (const tagId of tags) {
          await newPost.addPostTag(tagId, { transaction });
        }
      }

      return {
        message: "Post created successfully",
      };
    })
    .catch((error) => {
      console.error("Error creating post:", error);
      throw error; // Rethrow the error to be handled by the caller
    });
}

async function createSlug(title: string): Promise<string> {
  // Replace non-word characters with dashes, convert to lowercase, and trim dashes from start/end
  let slug = title
    .replace(/\W+/g, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");

  // Check if a post with this slug already exists
  const existingPost = await models.post.findOne({
    where: { slug },
  });

  // If a post with this slug exists, append the current date to the end
  if (existingPost) {
    const date = new Date();
    const dateString = `${date.getFullYear()}-${
      date.getMonth() + 1
    }-${date.getDate()}`;
    slug = `${slug}-${dateString}`;
  }

  return slug;
}
