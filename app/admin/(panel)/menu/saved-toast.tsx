"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast";

/** Shows a confirmation after redirecting back from the item form (?saved=1). */
export function SavedToast() {
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  useEffect(() => {
    if (sp.get("saved")) {
      toast("Menu item saved");
      router.replace("/admin/menu", { scroll: false });
    }
  }, [sp, router, toast]);
  return null;
}
