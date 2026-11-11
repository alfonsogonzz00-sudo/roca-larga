"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui";
import { setMyPhoto } from "@/app/actions/profile";

/** Recorta al centro en cuadrado y reduce a 512 px JPEG (las fotos del móvil pesan mucho) */
async function toSquareJpeg(file: File, size = 512): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  c.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo procesar la imagen"))), "image/jpeg", 0.85));
}

export function AvatarUpload({ userId, name, src, color, size = 76, light }: { userId: string; name: string; src?: string | null; color?: string; size?: number; light?: boolean }) {
  const [url, setUrl] = useState(src ?? null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [, start] = useTransition();
  const router = useRouter();

  const onFile = async (f?: File) => {
    if (!f) return;
    setMsg(null);
    if (!f.type.startsWith("image/")) return setMsg({ ok: false, text: "Eso no parece una foto." });
    setBusy(true);
    try {
      const blob = await toSquareJpeg(f);
      const sb = createClient();
      const path = `avatars/${userId}/${Date.now()}.jpg`;
      const { error } = await sb.storage.from("media").upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (error) throw new Error("No se pudo subir la foto. Inténtalo de nuevo.");
      const publicUrl = sb.storage.from("media").getPublicUrl(path).data.publicUrl;
      const r = await setMyPhoto(publicUrl);
      if (!r.ok) throw new Error(r.error);
      setUrl(publicUrl);
      setMsg({ ok: true, text: "Foto actualizada. Sales guapo." });
      start(() => router.refresh());
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    const r = await setMyPhoto(null);
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setUrl(null);
    setMsg({ ok: true, text: "Foto eliminada." });
    start(() => router.refresh());
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <label className="relative cursor-pointer rounded-full focus-within:ring-2 focus-within:ring-pitch" aria-label="Cambiar foto de perfil">
        <Avatar name={name} src={url} size={size} color={color} />
        <span className="absolute -right-0.5 -bottom-0.5 flex h-7 w-7 items-center justify-center rounded-none border-2 border-bg bg-pitch text-pitch-ink">
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Camera size={14} aria-hidden />}
        </span>
        <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {url && !busy && <button type="button" onClick={remove} className={light ? "text-[11px] text-white/70 underline" : "text-[11px] text-ink-3 underline"}>Quitar</button>}
      {msg && <p role="status" className={msg.ok ? "max-w-28 text-center text-[11px] text-win" : "max-w-28 text-center text-[11px] text-danger"}>{msg.text}</p>}
    </div>
  );
}
