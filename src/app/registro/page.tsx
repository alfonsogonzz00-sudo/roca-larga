import { redirect } from "next/navigation";
import { cancelLink } from "@/app/actions/profile";
import { Card, Notice, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/data/session";
import { getTexts } from "@/lib/data/config";
import { LinkForm } from "./link-form";

export const metadata = { title: "Vincular cuenta" };

export default async function Registro() {
  const s = await requireSession("/registro");
  if (s.player) redirect("/perfil");
  const t = await getTexts();
  const supabase = await createClient();
  const { data: teams } = await supabase.from("teams").select("id,name,crest_url,primary_color").order("sort_order");

  if (s.pendingLink) {
    const { data: p } = await supabase.from("players").select("full_name").eq("id", s.pendingLink.player_id).maybeSingle();
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader eyebrow="Registro" title="Solicitud enviada" />
        <Card className="space-y-3 p-4">
          <Notice tone="info">{t("profile.pending_link")}</Notice>
          <p className="text-sm text-ink-2">Has pedido vincularte como <strong className="text-ink">{p?.full_name}</strong>{s.pendingLink.requested_nickname ? <> («{s.pendingLink.requested_nickname}»)</> : null}. Mientras tanto puedes consultar toda la información.</p>
          <form action={async () => { "use server"; await cancelLink(); }}>
            <SubmitButton variant="secondary">Cancelar y elegir otro</SubmitButton>
          </form>
        </Card>
      </div>
    );
  }

  const withCandidates = await Promise.all((teams ?? []).map(async (team) => {
    const { data } = await supabase.rpc("link_candidates", { p_team: team.id });
    return { ...team, candidates: data ?? [] };
  }));
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader eyebrow="Registro" title={t("onboarding.title")} subtitle="Elige tu equipo y tu nombre. Un organizador validará la solicitud." />
      <LinkForm teams={withCandidates} />
    </div>
  );
}
