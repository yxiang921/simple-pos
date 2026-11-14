/** Plain link that switches the back office to a branch, then opens `next` (see app/admin/switch). */
export function switchHref(branchId: string, next: string) {
  return `/admin/switch?to=${encodeURIComponent(branchId)}&next=${encodeURIComponent(next)}`;
}

export function guestUrl(merchantSlug: string, branchSlug: string, rest = "") {
  return `/s/${merchantSlug}/${branchSlug}${rest}`;
}
