import { Icon } from "@iconify/react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/router";
import { ReactNode, useEffect, useState } from "react";

interface PageTransitionProps {
  children: ReactNode;
}

const pageVariants = {
  initial: {
    opacity: 0,
    scale: 0.98,
  },
  in: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.2,
      ease: "easeOut",
    },
  },
  out: {
    opacity: 0,
    scale: 0.98,
    transition: {
      duration: 0.2,
      ease: "easeIn",
    },
  },
};

const PageTransition = ({ children }: PageTransitionProps) => {
  const router = useRouter();
  const [isAnimating, setIsAnimating] = useState(false);
  const [key, setKey] = useState(router.asPath);

  useEffect(() => {
    const getPathname = (url: any) => {
      if (!url) return "";
      if (typeof url === "string") {
        return url.split("?")[0];
      } else if (typeof url === "object" && url.asPath) {
        return url.asPath.split("?")[0];
      }
      return "";
    };

    const handleRouteChangeStart = (url: any) => {
      const newPath = getPathname(url);
      const currentPath = getPathname(router.asPath);

      // Prevent transition if the URL starts with /trade or /binary
      if (newPath.startsWith("/trade") || newPath.startsWith("/binary")) {
        return;
      }

      if (newPath !== currentPath) {
        setIsAnimating(true);
      }
    };

    const handleRouteChangeComplete = (url: any) => {
      const newPath = getPathname(url);
      const currentPath = getPathname(router.asPath);

      if (newPath && newPath !== currentPath) {
        setKey(typeof url === "string" ? url : url.asPath || "");
      }
      setIsAnimating(false);
    };

    router.events.on("routeChangeStart", handleRouteChangeStart);
    router.events.on("routeChangeComplete", handleRouteChangeComplete);
    router.events.on("routeChangeError", handleRouteChangeComplete);

    return () => {
      router.events.off("routeChangeStart", handleRouteChangeStart);
      router.events.off("routeChangeComplete", handleRouteChangeComplete);
      router.events.off("routeChangeError", handleRouteChangeComplete);
    };
  }, [router]);

  return (
    <>
      <AnimatePresence mode="wait">
        {isAnimating ? (
          <div className="w-full h-[calc(100vh_-_80px)] flex items-center justify-center">
            <Icon
              className="w-8 h-8 animate-spin text-primary-500 dark:text-primary-400"
              icon="mingcute:loading-3-line"
            />
          </div>
        ) : (
          <motion.div
            key={key}
            initial="initial"
            animate="in"
            exit="out"
            variants={pageVariants}
            className="hidden-scrollbar"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default PageTransition;
