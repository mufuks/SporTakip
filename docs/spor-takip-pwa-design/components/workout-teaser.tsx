import { ChevronRight } from "lucide-react"

export function WorkoutTeaser() {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3.5 rounded-2xl border border-[#222228] bg-[#141418] p-4 text-left transition-colors active:bg-[#1a1a20]"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/6 text-[20px]" aria-hidden="true">
        🦵
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">Son Antrenmanım</p>
          <span className="text-[11px] font-medium text-white/35">· Dün</span>
        </div>
        <p className="mt-0.5 truncate text-[15px] font-bold tracking-tight text-white">Bacak Günü A</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium text-white/50">
          <span>4 Egzersiz</span>
          <span className="text-white/20">•</span>
          <span>14 Set</span>
          <span className="text-white/20">•</span>
          <span className="font-semibold text-[#CCFF00]">
            PR: Squat 85kg <span aria-hidden="true">🏆</span>
          </span>
        </p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-white/30" strokeWidth={2} />
    </button>
  )
}
