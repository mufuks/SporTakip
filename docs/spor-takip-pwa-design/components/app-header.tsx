import { Bell } from "lucide-react"

export function AppHeader() {
  return (
    <header className="flex items-center justify-between px-5 pt-3 pb-2">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-white/50">Merhaba,</p>
        <div className="flex items-center gap-2">
          <h1 className="truncate text-[22px] font-bold leading-tight tracking-tight text-white">
            {"Meltem "}
            <span aria-hidden="true">👋</span>
          </h1>
        </div>
        <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-[#CCFF00]/25 bg-[#CCFF00]/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#CCFF00]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#CCFF00] animate-status-blink" />
          Active Athlete
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Bildirimler"
          className="relative grid h-11 w-11 place-items-center rounded-full border border-[#222228] bg-[#141418] text-white/80 transition-colors active:bg-[#1c1c22]"
        >
          <Bell className="h-5 w-5" strokeWidth={1.75} />
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-[#F59E0B] ring-2 ring-[#0A0A0C]" />
        </button>

        <div className="rounded-full p-[2px] ring-2 ring-[#CCFF00]/70">
          <img
            src="/athlete-woman-portrait-dark.png"
            alt="Meltem'in profil fotoğrafı"
            className="h-10 w-10 rounded-full object-cover"
          />
        </div>
      </div>
    </header>
  )
}
