"use client"

import { Zap, Users, ListPlus } from "lucide-react"

type Status = "open" | "filling" | "full"

export type Session = {
  time: string
  title: string
  trainer: string
  filled: number
  capacity: number
  status: Status
  lastCancel?: string
  waitlistPosition?: number
}

const STATUS_META: Record<Status, { dot: string; label: string; text: string }> = {
  open: { dot: "bg-[#10B981]", label: "Müsait", text: "text-[#10B981]" },
  filling: { dot: "bg-[#F59E0B]", label: "Doluyor", text: "text-[#F59E0B]" },
  full: { dot: "bg-[#EF4444]", label: "Kontenjan Dolu", text: "text-[#EF4444]" },
}

export function SessionCard({
  session,
  onBook,
}: {
  session: Session
  onBook: () => void
}) {
  const meta = STATUS_META[session.status]
  const isFull = session.status === "full"

  return (
    <article className="rounded-2xl border border-[#222228] bg-[#141418] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="inline-flex rounded-lg bg-white/6 px-2.5 py-1 font-mono text-[13px] font-bold tracking-tight text-white">
            {session.time}
          </span>
          <h3 className="mt-2.5 text-[16px] font-bold leading-snug tracking-tight text-white">{session.title}</h3>
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#222228] bg-[#0A0A0C] px-2.5 py-1 text-[12px] font-medium text-white/70">
            <span aria-hidden="true">🏋️</span>
            {session.trainer}
          </span>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className={`flex items-center gap-1.5 text-[12px] font-bold ${meta.text}`}>
            <span className={`h-2 w-2 rounded-full ${meta.dot} ${!isFull ? "animate-status-blink" : ""}`} />
            {meta.label}
          </span>
          <span className="flex items-center gap-1 text-[12px] font-semibold text-white/55">
            <Users className="h-3.5 w-3.5" strokeWidth={2} />
            {session.filled} / {session.capacity} {isFull ? "Dolu" : "Sporcu"}
          </span>
        </div>
      </div>

      {session.lastCancel && (
        <div className="mt-3.5 flex items-start gap-2 rounded-xl border border-[#CCFF00]/15 bg-[#CCFF00]/[0.06] px-3 py-2.5">
          <Zap className="mt-0.5 h-4 w-4 shrink-0 text-[#CCFF00]" strokeWidth={2.25} />
          <p className="text-[12px] leading-snug text-white/70">
            <span className="font-semibold text-white/90">Son İptal: {session.lastCancel}</span>
            {" — Ders hakkınız yanmadan iptal edilebilir."}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={onBook}
        className={
          isFull
            ? "mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-[#CCFF00]/50 bg-transparent py-3.5 text-[15px] font-bold text-[#CCFF00] transition-colors active:bg-[#CCFF00]/10"
            : "mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#CCFF00] py-3.5 text-[15px] font-extrabold text-[#0A0A0C] transition-transform active:scale-[0.98]"
        }
      >
        {isFull ? (
          <>
            <ListPlus className="h-4.5 w-4.5" strokeWidth={2.25} />
            Yedek Listeye Katıl (Sıra #{session.waitlistPosition})
          </>
        ) : (
          "Seansı Rezerve Et"
        )}
      </button>
    </article>
  )
}
