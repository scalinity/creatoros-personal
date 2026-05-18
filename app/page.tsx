import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getAdminContext } from "@/lib/auth/admin";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "CreatorOS Personal",
};

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const result = await getAdminContext();

  if (result.ok) {
    redirect("/dashboard");
  }

  redirect("/login");
}
