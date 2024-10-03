import React, { useState, useEffect, memo } from "react";
import path from "path";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { useDashboardStore } from "@/stores/dashboard";

const isDarkDefault = process.env.NEXT_PUBLIC_DEFAULT_THEME === "dark" || false;
export const sanitizePath = (inputPath) => {
  // Normalize the path to resolve any '..' sequences
  const normalizedPath = path.normalize(inputPath);

  // Check if the normalized path is still within the intended directory
  if (normalizedPath.includes("..")) {
    throw new Error("Invalid path: Path traversal detected");
  }

  return normalizedPath;
};

type MashImageBaseProps = {
  src: string;
  alt: string;
  fill?: boolean;
  width?: number;
  height?: number;
  className?: string;
  transparent?: boolean;
};

const MashImageBase = ({
  src,
  alt,
  fill,
  width,
  height,
  className,
  transparent,
  ...props
}: MashImageBaseProps) => {
  const [imgSrc, setImgSrc] = useState(src);
  const { isDark } = useDashboardStore();
  const [skeletonProps, setSkeletonProps] = useState({
    baseColor: isDarkDefault ? "#27272a" : "#f7fafc",
    highlightColor: isDarkDefault ? "#3a3a3e" : "#edf2f7",
  });

  useEffect(() => {
    setSkeletonProps({
      baseColor: isDark ? "#27272a" : "#f7fafc",
      highlightColor: isDark ? "#3a3a3e" : "#edf2f7",
    });
  }, [isDark]);

  useEffect(() => {
    if (src) {
      setImgSrc(src);
    } else if (!transparent) {
      setImgSrc(
        src?.includes("uploads/avatar") || src?.includes("uploads/users")
          ? "/img/avatars/placeholder.webp"
          : "/img/placeholder.svg"
      );
    }
  }, [src]);

  // Separate imgProps for HTML img element
  const imgProps = { ...props, width, height, className };

  if (!imgSrc && transparent)
    return <Skeleton width={width} height={height} {...skeletonProps} />;

  return <img src={imgSrc} alt={alt} {...imgProps} />;
};

export const MashImage = memo(MashImageBase);
