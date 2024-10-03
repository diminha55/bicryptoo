import { useEffect } from "react";
import { useRouter } from "next/router";
import { AppProps } from "next/app";
import "@/styles/globals.css";
import { Toaster } from "sonner";
import { AppWebSocketProvider, useWebSocket } from "@/context/WebSocketContext";
import { restoreLayoutFromStorage } from "@/stores/layout";
import { appWithTranslation } from "next-i18next";
import "../i18n";
import { useDashboardStore } from "@/stores/dashboard";

function MyApp({ Component, pageProps }: AppProps) {
  const { fetchProfile, isFetched } = useDashboardStore();
  const { isConnected } = useWebSocket();

  const router = useRouter();

  useEffect(() => {
    restoreLayoutFromStorage();
  }, []);

  useEffect(() => {
    if (router.isReady && !isFetched) {
      fetchProfile();
    }
  }, [router.isReady, isFetched, fetchProfile]);

  useEffect(() => {
    const handleRouteChange = (url) => {
      if (process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_STATUS === "true") {
        const { gtag } = window as any;
        gtag("config", process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID, {
          page_path: url,
        });
      }
      if (process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_STATUS === "true") {
        const { fbq } = window as any;
        fbq("track", "PageView");
      }
    };

    router.events.on("routeChangeComplete", handleRouteChange);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router.events]);

  return (
    <div>
      <Toaster
        closeButton
        richColors
        theme="system"
        position="top-center"
        toastOptions={{
          duration: 3000,
        }}
      />
      <Component {...pageProps} />
    </div>
  );
}

const AppWithProviders = appWithTranslation(MyApp);

function WrappedApp(props: AppProps) {
  return (
    <AppWebSocketProvider>
      <AppWithProviders {...props} />
    </AppWebSocketProvider>
  );
}

export default WrappedApp;
