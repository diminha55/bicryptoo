"use client";
import React, { useEffect, useRef, useState } from "react";
import Layout from "@/layouts/Default";
import $fetch from "@/utils/api";
import { useRouter } from "next/router";
import { safeJSONParse } from "@/utils/datatable";
import Card from "@/components/elements/base/card/Card";
import Button from "@/components/elements/base/button/Button";
import Input from "@/components/elements/form/input/Input";
import Textarea from "@/components/elements/form/textarea/Textarea";
import ListBox from "@/components/elements/form/listbox/Listbox";
import { capitalize } from "lodash";
import { useTranslation } from "next-i18next";
import { useDashboardStore } from "@/stores/dashboard";
import { slugify } from "@/utils/strings";

export default function PostEditor() {
  const { t } = useTranslation();
  const { profile } = useDashboardStore();
  const [postData, setPostData] = useState<BlogPostCreateInput | null>(null);
  const editorRef = useRef<any>(null);
  const router = useRouter();
  const [categories, setCategories] = useState<
    {
      value: string;
      label: string;
    }[]
  >([]);
  const [tagsArray, setTagsArray] = useState([]);
  const { category, id } = router.query;

  const imageUploader = async (file: File) => {
    const fileToBase64 = async (file: File) => {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject("Error reading file");
        reader.readAsDataURL(file);
      });
    };

    const base64File = await fileToBase64(file);
    const img = new Image();
    img.src = base64File;
    await new Promise((resolve) => (img.onload = resolve));
    const width = img.naturalWidth;
    const height = img.naturalHeight;

    const filePayload = {
      file: base64File,
      dir: `blog/${category}/${id}`,
      width: Number(width) > 720 ? 720 : Number(width),
      height: Number(height) > 720 ? 720 : Number(height),
      oldPath: "",
    };

    try {
      const { data, error } = await $fetch({
        url: "/api/upload",
        method: "POST",
        body: filePayload,
      });
      if (error) {
        throw new Error("File upload failed");
      }
      return {
        success: 1,
        file: {
          url: data.url,
        },
      };
    } catch (error) {
      console.error("Error uploading file:", error);
      return { success: 0 };
    }
  };

  const initializeEditor = async (content = {}) => {
    const Paragraph = (await import("@editorjs/paragraph")).default;
    const Header = (await import("@editorjs/header")).default;
    const Quote = (await import("@editorjs/quote")).default;
    const Warning = (await import("@editorjs/warning")).default;
    const Delimiter = (await import("@editorjs/delimiter")).default;
    const List = (await import("@editorjs/nested-list")).default;
    const Checklist = (await import("@editorjs/checklist")).default;
    const Image = (await import("@editorjs/image")).default;
    const Embed = (await import("@editorjs/embed")).default;
    const Table = (await import("@editorjs/table")).default;
    const Raw = (await import("@editorjs/raw")).default;
    const Button = (await import("editorjs-button")).default;
    const Marker = (await import("@editorjs/marker")).default;
    const InlineCode = (await import("@editorjs/inline-code")).default;
    const Underline = (await import("@editorjs/underline")).default;

    import("@editorjs/editorjs").then((EditorJS) => {
      editorRef.current = new EditorJS.default({
        holder: "editor-container",
        data: content || ({} as any),
        tools: {
          paragraph: {
            class: Paragraph,
          },
          header: {
            class: Header,
          },
          quote: {
            class: Quote,
          },
          warning: {
            class: Warning,
          },
          delimiter: {
            class: Delimiter,
          },
          list: {
            class: List,
          },
          checklist: {
            class: Checklist,
          },
          image: {
            class: Image,
            config: {
              uploader: {
                uploadByFile: imageUploader,
              },
            },
          },
          embed: {
            class: Embed,
          },
          table: {
            class: Table,
          },
          raw: {
            class: Raw,
          },
          button: {
            class: Button,
          },
          marker: {
            class: Marker,
          },
          inlineCode: {
            class: InlineCode,
          },
          underline: {
            class: Underline,
          },
        },
        onReady: () => {
          if (editorRef.current) {
            try {
              onEditorReady();
            } catch (error) {
              console.error("Error initializing plugins:", error);
            }
          }
        },
      });
    });
  };

  const [initiated, setInitiated] = useState(false);

  const onEditorReady = async () => {
    if (!editorRef.current) return;

    try {
      const Undo = (await import("editorjs-undo")).default;
      const DragDrop = (await import("editorjs-drag-drop")).default;
      new Undo({ editor: editorRef.current });
      new DragDrop(editorRef.current);
    } catch (error) {
      console.error("Error initializing editor plugins:", error);
    }
  };

  useEffect(() => {
    if (editorRef.current && !initiated) {
      onEditorReady();
      setInitiated(true);
    }
  }, [editorRef.current, initiated]);

  useEffect(() => {
    if (router.isReady) {
      fetchCategories();
      if (id) {
        fetchData();
      } else {
        initializeEditor();
      }
    }
    return () => {
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
  }, [router.isReady]);

  const fetchData = async () => {
    if (
      !id ||
      !profile ||
      !profile.author ||
      profile?.author?.status !== "APPROVED"
    )
      return;
    const { data, error } = await $fetch({
      url: `/api/content/author/${profile?.author?.id}/${id}`,
      silent: true,
    });
    if (!error && data) {
      setPostData({
        ...data,
        status: {
          value: data.status,
          label: capitalize(data.status),
        },
      });
      setTagsArray(data.tags.map((tag) => tag.name));
      const content = safeJSONParse(data.content);
      initializeEditor(content);
    }
  };

  const fetchCategories = async () => {
    const { data, error } = await $fetch({
      url: "/api/content/category",
      silent: true,
    });
    if (!error && data) {
      setCategories(
        data.map((category) => ({
          value: category.id,
          label: category.name,
        }))
      );
    }
  };

  const handleSubmit = async () => {
    if (!editorRef.current) return;
    if (!postData || !postData.title) return;
    const savedData = await editorRef.current.save();
    const status: string = (postData.status as any)?.value;
    const { error } = await $fetch({
      url: `/api/content/author/${profile?.author?.id}${id ? `/${id}` : ""}`,
      method: id ? "PUT" : "POST",
      body: {
        title: postData.title,
        description: postData.description,
        content: JSON.stringify(savedData),
        categoryId: postData.categoryId,
        tags: tagsArray,
        status: status,
        ...(!id && { slug: slugify(postData.title) }),
      },
    });
    if (!error) {
      router.push(`/user/blog/post/${profile?.author?.id}`);
    }
  };

  const handleTagsInputChange = (e) => {
    const newTags = e.target.value.split(", ");
    setTagsArray(newTags);
  };

  return (
    <Layout title={t("Blog Editor")} color="muted">
      <Card className="p-5 mb-5 text-muted-800 dark:text-muted-100">
        <div className="flex justify-between items-center">
          <h1 className="text-lg">
            {id
              ? `${t("Editing")} ${postData ? postData.title : "Post"}`
              : t("New Post")}
          </h1>
          <div className="flex gap-2">
            <Button
              onClick={() =>
                router.push(`/user/blog/author/${profile?.author?.id}`)
              }
              variant="outlined"
              shape="rounded"
              size="md"
              color="danger"
            >
              {t("Cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              variant="outlined"
              shape="rounded"
              size="md"
              color="success"
            >
              {t("Save")}
            </Button>
          </div>
        </div>
        {/* title, desc, tags, category edit */}
        <div>
          <Input
            label={t("Title")}
            placeholder={t("Post title")}
            value={postData ? postData.title : ""}
            onChange={(e) =>
              setPostData({ ...postData, title: e.target.value })
            }
          />
          <Textarea
            label={t("Description")}
            placeholder={t("Post description")}
            value={postData ? postData.description : ""}
            onChange={(e) =>
              setPostData({ ...postData, description: e.target.value })
            }
          />
          <div className="flex gap-2">
            <Input
              label={t("Tags")}
              placeholder={t("Post tags")}
              value={tagsArray.join(", ")}
              onChange={handleTagsInputChange}
            />
            <ListBox
              label={t("Category")}
              options={categories}
              selected={
                postData && postData.categoryId
                  ? categories.find(
                      (category) => category.value === postData.categoryId
                    ) || {
                      value: "",
                      label: t("Select a category"),
                    }
                  : { value: "", label: t("Select a category") }
              }
              setSelected={(selectedCategory) =>
                setPostData({ ...postData, categoryId: selectedCategory.value })
              }
            />
            <ListBox
              label={t("Status")}
              options={[
                { value: "DRAFT", label: "Draft" },
                { value: "PUBLISHED", label: "Published" },
              ]}
              selected={
                postData && postData.status
                  ? postData.status
                  : { value: "DRAFT", label: "Draft" }
              }
              setSelected={(e) => setPostData({ ...postData, status: e })}
            />
          </div>
        </div>
      </Card>
      <Card className="mb-5">
        <div className="p-5">
          <h2 className="text-lg text-muted-800 dark:text-muted-100">
            {t("Content")}
          </h2>
        </div>
        <hr className="border-t border-muted-300 dark:border-muted-700" />
        <div className="editor-container mt-10 p-5" id="editor-container" />
      </Card>
    </Layout>
  );
}
