import type { Metadata } from "next";
import ClanSite from "@/components/clan-site";

export const metadata: Metadata = { title: "De clan | Hijgend Hert" };

export default function Page() {
  return <ClanSite view="clan"/>;
}
