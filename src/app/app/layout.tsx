"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppProvider, useApp } from "@/lib/app-context";
import { AppShell } from "@/components/AppShell";

function Guard({ children }: { children: React.ReactNode }) {
  const { profile } = useApp();
  const router = useRouter();

  useEffect(() => {
    // once profile has loaded and onboarding isn't done, send user through onboarding
    if (profile && !profile.onboarding_completed) {
      router.replace("/onboarding");
    }
  }, [profile, router]);

  return <AppShell>{children}</AppShell>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <Guard>{children}</Guard>
    </AppProvider>
  );
}
