"use client";
import { setAttendance } from "@/app/actions/profile";
import { ActionForm, SubmitButton } from "@/components/ui/client";

export function AttendanceButtons({ matchId, current }: { matchId: string; current: "pending" | "yes" | "no" }) {
  return (
    <div className="flex gap-2">
      <ActionForm action={setAttendance} className="flex-1">
        <input type="hidden" name="match_id" value={matchId} />
        <input type="hidden" name="going" value="yes" />
        <SubmitButton variant={current === "yes" ? "primary" : "secondary"} className="w-full" pendingLabel="…">{current === "yes" ? "✓ Voy" : "Voy"}</SubmitButton>
      </ActionForm>
      <ActionForm action={setAttendance} className="flex-1">
        <input type="hidden" name="match_id" value={matchId} />
        <input type="hidden" name="going" value="no" />
        <SubmitButton variant={current === "no" ? "danger" : "secondary"} className="w-full" pendingLabel="…">{current === "no" ? "✕ No puedo" : "No puedo"}</SubmitButton>
      </ActionForm>
    </div>
  );
}
