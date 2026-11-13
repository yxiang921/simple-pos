"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input } from "@/components/ui/form";
import { Badge, EmptyState, Panel, Table, TD, TH, THead, TR } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { deleteCategoryAction, saveCategoryAction } from "../../../_actions/menu";

type Category = { id: string; name: string; sortOrder: number; isActive: boolean; itemCount: number };

export function CategoryManager({ categories }: { categories: Category[] }) {
  const toast = useToast();
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button variant="primary" onClick={() => setEditing("new")}>
          <Plus /> New category
        </Button>
      </div>
      <Panel>
        {categories.length === 0 ? (
          <EmptyState title="No categories" description="Create categories such as Mains, Drinks or Desserts." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH className="w-20">Order</TH>
                <TH>Name</TH>
                <TH className="text-right">Items</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <tbody>
              {categories.map((c) => (
                <TR key={c.id}>
                  <TD className="tabular text-muted">{c.sortOrder}</TD>
                  <TD className="font-medium">{c.name}</TD>
                  <TD className="tabular text-right">{c.itemCount}</TD>
                  <TD>{c.isActive ? <Badge tone="green">Visible</Badge> : <Badge tone="outline">Hidden</Badge>}</TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="size-7" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                        <Pencil />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-danger hover:bg-danger-soft"
                        aria-label={`Delete ${c.name}`}
                        onClick={() => setDeleting(c)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      {editing && (
        <CategoryDialog
          category={editing === "new" ? null : editing}
          nextSort={(categories.at(-1)?.sortOrder ?? 0) + 10}
          onClose={() => setEditing(null)}
        />
      )}

      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        width="sm"
        title={`Delete "${deleting?.name}"?`}
        description="Only empty categories can be deleted. To keep items but hide them, edit the category and untick Visible."
      >
        <DialogFooter>
          <Button onClick={() => setDeleting(null)}>Cancel</Button>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await deleteCategoryAction(deleting!.id);
                if (res.ok) {
                  toast("Category deleted");
                  setDeleting(null);
                } else toast(res.error, "error");
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

function CategoryDialog({ category, nextSort, onClose }: { category: Category | null; nextSort: number; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(category?.name ?? "");
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? nextSort));
  const [isActive, setIsActive] = useState(category?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open onClose={onClose} width="sm" title={category ? "Edit category" : "New category"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const res = await saveCategoryAction(category?.id ?? null, { name, sortOrder, isActive });
            if (res.ok) {
              toast(category ? "Category updated" : "Category created");
              onClose();
            } else setError(res.error);
          });
        }}
        className="space-y-4"
      >
        <FormError message={error} />
        <Field label="Name" htmlFor="cat-name">
          <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
        </Field>
        <Field label="Sort order" htmlFor="cat-sort" hint="Lower numbers appear first on the menu.">
          <Input id="cat-sort" inputMode="numeric" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="w-28" />
        </Field>
        <Checkbox label="Visible on guest menu" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending || !name.trim()}>
            {pending && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
