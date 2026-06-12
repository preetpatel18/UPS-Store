import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, ClipboardCheck, FolderPlus, Minus, PackageX, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Card, CardTitle } from "../components/Card";
import { apiFetch } from "../lib/api";
import { cn } from "../lib/utils";

type InventoryItem = {
  _id: string;
  name: string;
  sku: string;
  category: string;
  quantity: number;
  price: number | null;
  threshold: number;
  lowStockEnabled: boolean;
};

type ItemDraft = Omit<InventoryItem, "_id">;

const emptyItem = (category: string): ItemDraft => ({
  name: "",
  sku: "",
  category: category === "All" ? "Uncategorized" : category,
  quantity: 0,
  price: null,
  threshold: 5,
  lowStockEnabled: true
});

export function Inventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [newCategory, setNewCategory] = useState("");
  const [newItem, setNewItem] = useState<ItemDraft>(emptyItem("All"));
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState("");
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showCount, setShowCount] = useState(false);

  useEffect(() => {
    void loadInventory();
  }, []);

  async function loadInventory() {
    try {
      const [inventory, categoryList] = await Promise.all([
        apiFetch<InventoryItem[]>("/inventory"),
        apiFetch<string[]>("/inventory/categories")
      ]);
      setItems(inventory.map((item) => ({
        ...item,
        category: item.category || "Uncategorized",
        price: item.price ?? null,
        lowStockEnabled: item.lowStockEnabled !== false
      })));
      setCategories(categoryList);
    } catch (error) {
      setNotice(getError(error, "Could not load inventory."));
    }
  }

  function selectCategory(category: string) {
    setSelectedCategory(category);
    setNewItem(emptyItem(category));
    setEditing(null);
    setShowAddItem(false);
  }

  async function createCategory() {
    const name = newCategory.trim();
    if (!name) return;
    try {
      const created = await apiFetch<{ name: string }>("/inventory/categories", {
        method: "POST",
        body: JSON.stringify({ name })
      });
      setCategories((current) => Array.from(new Set([...current, created.name])).sort());
      setNewCategory("");
      setShowCategoryForm(false);
      selectCategory(created.name);
      setNotice(`${created.name} tab created.`);
    } catch (error) {
      setNotice(getError(error, "Could not create inventory tab."));
    }
  }

  async function deleteCategory() {
    if (selectedCategory === "All" || selectedCategory === "Uncategorized") return;
    const category = selectedCategory;
    const itemCount = filteredItems.length;
    const itemMessage = itemCount === 1 ? "1 item" : `${itemCount} items`;
    if (!window.confirm(`Delete the ${category} tab and all ${itemMessage} inside it? This cannot be undone.`)) return;
    try {
      await apiFetch(`/inventory/categories/${encodeURIComponent(category)}`, { method: "DELETE" });
      setItems((current) => current.filter((item) => item.category !== category));
      setCategories((current) => current.filter((currentCategory) => currentCategory !== category));
      selectCategory("All");
      setNotice(`${category} tab and ${itemMessage} removed.`);
    } catch (error) {
      setNotice(getError(error, "Could not remove inventory tab."));
    }
  }

  async function addItem() {
    if (!newItem.name.trim()) {
      setNotice("Item name is required.");
      return;
    }
    try {
      const created = await apiFetch<InventoryItem>("/inventory", {
        method: "POST",
        body: JSON.stringify(newItem)
      });
      setItems((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setCategories((current) => Array.from(new Set([...current, created.category])).sort());
      setNewItem(emptyItem(selectedCategory));
      setShowAddItem(false);
      setNotice(`${created.name} added to ${created.category}.`);
    } catch (error) {
      setNotice(getError(error, "Could not add inventory item."));
    }
  }

  async function adjust(item: InventoryItem, amount: number) {
    try {
      const updated = await apiFetch<InventoryItem>(`/inventory/${item._id}/adjust`, {
        method: "PATCH",
        body: JSON.stringify({ amount })
      });
      updateItemInState(updated);
    } catch (error) {
      setNotice(getError(error, "Could not adjust quantity."));
    }
  }

  async function saveItem() {
    if (!editing) return;
    try {
      const updated = await apiFetch<InventoryItem>(`/inventory/${editing._id}`, {
        method: "PATCH",
        body: JSON.stringify(editing)
      });
      updateItemInState(updated);
      setCategories((current) => Array.from(new Set([...current, updated.category])).sort());
      setEditing(null);
      setNotice(`${updated.name} updated.`);
    } catch (error) {
      setNotice(getError(error, "Could not update item."));
    }
  }

  async function deleteItem(item: InventoryItem) {
    if (!window.confirm(`Delete ${item.name} from inventory?`)) return;
    try {
      await apiFetch(`/inventory/${item._id}`, { method: "DELETE" });
      setItems((current) => current.filter((currentItem) => currentItem._id !== item._id));
      if (editing?._id === item._id) setEditing(null);
      setNotice(`${item.name} removed.`);
    } catch (error) {
      setNotice(getError(error, "Could not remove item."));
    }
  }

  function openCount() {
    setCounts(Object.fromEntries(filteredItems.map((item) => [item._id, item.quantity])));
    setShowCount(true);
  }

  async function applyCount() {
    const countEntries = filteredItems.map((item) => ({ id: item._id, quantity: Number(counts[item._id] ?? item.quantity) }));
    if (countEntries.length === 0) return;
    try {
      const updated = await apiFetch<InventoryItem[]>("/inventory/count/batch", {
        method: "PATCH",
        body: JSON.stringify({ counts: countEntries })
      });
      setItems((current) => current.map((item) => updated.find((updatedItem) => updatedItem._id === item._id) ?? item));
      setShowCount(false);
      setNotice(`${selectedCategory} inventory count applied.`);
    } catch (error) {
      setNotice(getError(error, "Could not apply inventory count."));
    }
  }

  function updateItemInState(updated: InventoryItem) {
    setItems((current) => current.map((item) => item._id === updated._id ? updated : item));
  }

  const filteredItems = useMemo(
    () => items.filter((item) => selectedCategory === "All" || item.category === selectedCategory),
    [items, selectedCategory]
  );
  const lowStock = filteredItems.filter((item) => item.lowStockEnabled && item.quantity <= item.threshold);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle title="Inventory" detail="Organize supplies by category and complete counts from one focused list" />
          <div className="flex flex-wrap gap-2">
            <button className="inline-flex h-10 items-center gap-2 rounded-xl border bg-white/80 px-3 text-sm shadow-sm dark:bg-zinc-900/80" onClick={() => setShowCategoryForm((value) => !value)}>
              <FolderPlus className="h-4 w-4" /> Add Tab
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-xl border bg-white/80 px-3 text-sm shadow-sm dark:bg-zinc-900/80" onClick={openCount} disabled={filteredItems.length === 0}>
              <ClipboardCheck className="h-4 w-4" /> Inventory Count
            </button>
            {selectedCategory !== "All" && selectedCategory !== "Uncategorized" ? (
              <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 bg-white/80 text-red-700 shadow-sm dark:border-red-900 dark:bg-zinc-900/80 dark:text-red-300" aria-label={`Delete ${selectedCategory} tab`} title="Delete this tab and its items" onClick={() => void deleteCategory()}>
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
            <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-3 text-sm text-primaryForeground shadow-soft" onClick={() => setShowAddItem((value) => !value)}>
              <Plus className="h-4 w-4" /> Add Item
            </button>
          </div>
        </div>

        {showCategoryForm ? (
          <div className="mb-4 flex max-w-md gap-2 rounded-xl border bg-white/55 p-3 shadow-sm dark:bg-zinc-900/55">
            <input className="h-10 min-w-0 flex-1 rounded-xl border bg-white/80 px-3 text-sm shadow-sm dark:bg-zinc-900/80" placeholder="Tab name: Boxes, Paper, Retail..." value={newCategory} onChange={(event) => setNewCategory(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void createCategory()} />
            <button className="h-10 rounded-xl bg-primary px-3 text-sm text-primaryForeground shadow-soft" onClick={createCategory}>Create</button>
          </div>
        ) : null}

        <div className="thin-scrollbar flex gap-2 overflow-x-auto border-b pb-3">
          {["All", ...categories].map((category) => (
            <button key={category} className={cn("shrink-0 rounded-xl border bg-white/75 px-3 py-2 text-sm shadow-sm dark:bg-zinc-900/75", selectedCategory === category && "bg-primary text-primaryForeground dark:bg-primary")} onClick={() => selectCategory(category)}>
              {category}
            </button>
          ))}
        </div>

        {showAddItem ? (
          <div className="mt-4 rounded-xl border bg-white/55 p-4 shadow-sm dark:bg-zinc-900/55">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Add Inventory Item</h3>
              <button className="flex h-8 w-8 items-center justify-center rounded-lg border bg-white/80 shadow-sm dark:bg-zinc-900/80" aria-label="Close add item" onClick={() => setShowAddItem(false)}><X className="h-4 w-4" /></button>
            </div>
            <ItemFields item={newItem} categories={categories} onChange={setNewItem} />
            <button className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-3 text-sm text-primaryForeground shadow-soft" onClick={addItem}><Plus className="h-4 w-4" /> Add Item</button>
          </div>
        ) : null}

        {notice ? <p className="mt-4 rounded-xl border bg-white/70 px-4 py-3 text-sm shadow-sm dark:bg-zinc-900/70">{notice}</p> : null}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div>
            <h2 className="text-sm font-semibold">{selectedCategory === "All" ? "All Inventory" : selectedCategory}</h2>
            <p className="mt-1 text-xs text-mutedForeground">{filteredItems.length} items · {lowStock.length} low-stock alerts</p>
          </div>
          {lowStock.length ? <span className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"><AlertTriangle className="h-4 w-4" /> Low stock</span> : null}
        </div>

        <div className="divide-y">
          {filteredItems.map((item) => {
            const low = item.lowStockEnabled && item.quantity <= item.threshold;
            const outOfStock = item.quantity === 0;
            return (
              <div key={item._id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto_auto] md:items-center">
                <div className="flex min-w-0 items-start gap-3">
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-white/80 shadow-sm dark:bg-zinc-900/80", low && "border-red-200 text-red-700 dark:border-red-900 dark:text-red-300")}>
                    {low ? <AlertTriangle className="h-4 w-4" /> : <Boxes className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.name}</p>
                    {item.sku ? <p className="mt-1 truncate text-xs text-mutedForeground">{item.sku}</p> : null}
                    {item.price !== null ? <p className="mt-1 text-xs text-mutedForeground">{formatPrice(item.price)}</p> : null}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-mutedForeground">Low-stock alert</p>
                  <p className="mt-1 text-sm">{item.lowStockEnabled ? `At ${item.threshold} or fewer` : "Off"}</p>
                  {outOfStock ? <p className="mt-1 text-xs font-medium text-red-700 dark:text-red-300">No stock</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <button className="flex h-9 w-9 items-center justify-center rounded-xl border bg-white/75 shadow-sm dark:bg-zinc-900/75" aria-label={`Decrease ${item.name}`} onClick={() => void adjust(item, -1)}><Minus className="h-4 w-4" /></button>
                  <span className="w-12 text-center text-xl font-semibold">{item.quantity}</span>
                  <button className="flex h-9 w-9 items-center justify-center rounded-xl border bg-white/75 shadow-sm dark:bg-zinc-900/75" aria-label={`Increase ${item.name}`} onClick={() => void adjust(item, 1)}><Plus className="h-4 w-4" /></button>
                </div>
                <div className="flex gap-2">
                  <button className="flex h-9 w-9 items-center justify-center rounded-xl border bg-white/75 shadow-sm dark:bg-zinc-900/75" aria-label={`Edit ${item.name}`} onClick={() => setEditing(item)}><Pencil className="h-4 w-4" /></button>
                  <button className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 bg-white/75 text-red-700 shadow-sm dark:border-red-900 dark:bg-zinc-900/75 dark:text-red-300" aria-label={`Delete ${item.name}`} onClick={() => void deleteItem(item)}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })}
          {filteredItems.length === 0 ? <p className="py-10 text-center text-sm text-mutedForeground">No inventory items in this tab.</p> : null}
        </div>
      </Card>

      {editing ? (
        <Modal title="Edit Inventory Item" onClose={() => setEditing(null)}>
          <ItemFields item={editing} categories={categories} onChange={setEditing} />
          <button className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-3 text-sm text-primaryForeground shadow-soft" onClick={() => void saveItem()}><Save className="h-4 w-4" /> Save Changes</button>
        </Modal>
      ) : null}

      {showCount ? (
        <Modal title={`${selectedCategory} Inventory Count`} onClose={() => setShowCount(false)}>
          <div className="thin-scrollbar max-h-[55vh] divide-y overflow-y-auto">
            {filteredItems.map((item) => (
              <label key={item._id} className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_88px_auto]">
                <span>
                  <span className="block text-sm font-medium">{item.name}</span>
                  {item.sku ? <span className="mt-1 block text-xs text-mutedForeground">{item.sku}</span> : null}
                </span>
                <input className="h-10 rounded-xl border bg-white/80 px-3 text-sm shadow-sm dark:bg-zinc-900/80" type="number" min="0" value={counts[item._id] ?? item.quantity} onChange={(event) => setCounts((current) => ({ ...current, [item._id]: Math.max(0, Number(event.target.value)) }))} />
                <button type="button" className="col-span-2 inline-flex h-9 items-center justify-center gap-2 rounded-xl border bg-white/80 px-3 text-xs shadow-sm dark:bg-zinc-900/80 sm:col-span-1" onClick={() => setCounts((current) => ({ ...current, [item._id]: 0 }))}><PackageX className="h-4 w-4" /> No stock</button>
              </label>
            ))}
          </div>
          <button className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-3 text-sm text-primaryForeground shadow-soft" onClick={() => void applyCount()}><ClipboardCheck className="h-4 w-4" /> Apply Count</button>
        </Modal>
      ) : null}
    </div>
  );
}

function ItemFields({ item, categories, onChange }: { item: ItemDraft; categories: string[]; onChange: (item: any) => void }) {
  const inputClass = "h-10 w-full rounded-xl border bg-white/80 px-3 text-sm shadow-sm dark:bg-zinc-900/80";

  return (
    <div className="grid max-w-5xl gap-3 md:grid-cols-6">
      <label className="block md:col-span-2">
        <span className="mb-1.5 block text-xs font-medium text-mutedForeground">Item name</span>
        <input className={inputClass} placeholder="Item name" value={item.name} onChange={(event) => onChange({ ...item, name: event.target.value })} />
      </label>
      <label className="block md:col-span-2">
        <span className="mb-1.5 block text-xs font-medium text-mutedForeground">SKU</span>
        <input className={inputClass} placeholder="Optional" value={item.sku} onChange={(event) => onChange({ ...item, sku: event.target.value })} />
      </label>
      <label className="block md:col-span-2">
        <span className="mb-1.5 block text-xs font-medium text-mutedForeground">Price</span>
        <input className={inputClass} placeholder="Optional" type="number" min="0" step="0.01" value={item.price ?? ""} onChange={(event) => onChange({ ...item, price: event.target.value === "" ? null : Math.max(0, Number(event.target.value)) })} />
      </label>
      <label className="block md:col-span-2">
        <span className="mb-1.5 block text-xs font-medium text-mutedForeground">Category</span>
        <select className={inputClass} value={item.category} onChange={(event) => onChange({ ...item, category: event.target.value })}>
          {Array.from(new Set(["Uncategorized", ...categories])).map((category) => <option key={category}>{category}</option>)}
        </select>
      </label>
      <label className="block md:col-span-2">
        <span className="mb-1.5 block text-xs font-medium text-mutedForeground">Quantity</span>
        <input className={inputClass} type="number" min="0" value={item.quantity} onChange={(event) => onChange({ ...item, quantity: Math.max(0, Number(event.target.value)) })} />
      </label>
      <label className="block md:col-span-2">
        <span className="mb-1.5 block text-xs font-medium text-mutedForeground">Low-stock alert at</span>
        <input className={cn(inputClass, !item.lowStockEnabled && "opacity-45")} type="number" min="0" disabled={!item.lowStockEnabled} value={item.threshold} onChange={(event) => onChange({ ...item, threshold: Math.max(0, Number(event.target.value)) })} />
      </label>
      <div className="flex items-center justify-between gap-3 rounded-xl border bg-white/55 px-3 py-2 shadow-sm dark:bg-zinc-900/55 md:col-span-6">
        <div>
          <p className="text-xs font-medium">Low-stock alerts</p>
          <p className="mt-1 text-xs text-mutedForeground">Turn this off when the item does not need automatic stock warnings.</p>
        </div>
        <button type="button" className={cn("h-9 shrink-0 rounded-xl border px-3 text-xs font-medium shadow-sm", item.lowStockEnabled ? "bg-primary text-primaryForeground" : "bg-white/80 dark:bg-zinc-900/80")} aria-pressed={item.lowStockEnabled} onClick={() => onChange({ ...item, lowStockEnabled: !item.lowStockEnabled })}>
          {item.lowStockEnabled ? "Alerts on" : "Alerts off"}
        </button>
      </div>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
      <section className="w-full max-w-3xl rounded-xl border bg-white p-4 shadow-soft dark:bg-zinc-900">
        <div className="mb-4 flex items-center justify-between gap-3 border-b pb-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button className="flex h-8 w-8 items-center justify-center rounded-lg border bg-white/80 shadow-sm dark:bg-zinc-900/80" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

function getError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(price);
}
