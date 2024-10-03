import { useRouter } from "next/router";
import $fetch from "@/utils/api";
import { useDashboardStore } from "@/stores/dashboard";
import { userMenu } from "@/data/constants/menu";

export const useLogout = () => {
  const router = useRouter();
  const setProfile = useDashboardStore((state) => state.setProfile);
  const setFilteredMenu = useDashboardStore((state) => state.setFilteredMenu);
  const filterMenu = useDashboardStore((state) => state.filterMenu);

  return async () => {
    const { error } = await $fetch({
      url: "/api/auth/logout",
      method: "POST",
    });

    if (!error) {
      setProfile(null);
      const newFilteredMenu = filterMenu(userMenu);
      setFilteredMenu(newFilteredMenu);
      router.push("/");
    }
  };
};
