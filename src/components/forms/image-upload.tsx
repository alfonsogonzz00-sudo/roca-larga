"use client";
import { useState } from "react";
import { Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input, Notice } from "@/components/ui";

/** Sube una imagen al bucket «media» (sólo admin por RLS) y guarda la URL en un campo oculto */
export function ImageUpload({ name, defaultValue, folder, label = "Imagen" }: { name: string; defaultValue?: string | null; folder: string; label?: string }) {
  const [url, setUrl] = useState(defaultValue ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(f.type)) return setErr("Formato no admitido (PNG, JPG, WebP o SVG).");
    if (f.size > 5 * 1024 * 1024) return setErr("La imagen supera 5 MB.");
    setBusy(true);
    const sb = createClient();
    const path = `${folder}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const { error } = await sb.storage.from("media").upload(path, f, { cacheControl: "31536000", upsert: false });
    setBusy(false);
    if (error) return setErr(error.message);
    setUrl(sb.storage.from("media").getPublicUrl(path).data.publicUrl);
  };
  return (
    <div className="space-y-2">
      <span className="block text-sm font-semibold">{label}</span>
      <div className="flex items-center gap-3">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-14 w-14 rounded-xl bg-white shadow-card object-contain p-1" />
        ) : <span className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-line-strong text-ink-3"><Upload size={18} /></span>}
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-surface-2 hover:bg-surface-3 px-3 text-sm font-semibold hover:bg-surface-2">
          <Upload size={16} /> {busy ? "Subiendo…" : "Subir"}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} disabled={busy} />
        </label>
        {url && <button type="button" className="text-sm text-ink-3 underline" onClick={() => setUrl("")}>Quitar</button>}
      </div>
      <Input name={name} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="o pega una URL" aria-label={`URL de ${label.toLowerCase()}`} />
      {err && <Notice tone="danger">{err}</Notice>}
    </div>
  );
}
