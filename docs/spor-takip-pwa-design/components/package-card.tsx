import { Dumbbell, CalendarClock, Wallet } from "lucide-react"

const TOTAL = 8
const USED = 5

function Metric({
  icon: Icon,
  label,
  value,
  valueClass = "text-white",
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-white/45">
        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
        {label}
      </span>
      <span className={`text-[15px] font-bold tracking-tight ${valueClass}`}>{value}</span>
    </div>
  )
}

export function PackageCard() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-[#222228] bg-gradient-to-b from-[#17171c] to-[#111115] p-5">
      <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-[#CCFF00]/10 blur-3xl" />

      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">Aktif Paket</p>
          <h2 className="mt-1 flex items-center gap-2 text-[20px] font-extrabold tracking-tight text-white">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#CCFF00]/15 text-[#CCFF00]">
              <Dumbbell className="h-4.5 w-4.5" strokeWidth={2.25} />
            </span>
            Grup 8 Ders
          </h2>
        </div>
        <span className="rounded-full bg-[#10B981]/15 px-3 py-1 text-[11px] font-bold text-[#10B981]">Aktif</span>
      </div>

      <div className="relative mt-5 flex items-center gap-1.5" aria-label={`${USED} / ${TOTAL} ders tamamlandı`}>
        {Array.from({ length: TOTAL }).map((_, i) => (
          <span
            key={i}
            className={`h-2.5 flex-1 rounded-full transition-all ${
              i < USED ? "bg-[#CCFF00] shadow-[0_0_10px_rgba(204,255,0,0.35)]" : "bg-white/8"
            }`}
          />
        ))}
      </div>

      <div className="relative mt-5 grid grid-cols-3 gap-3 border-t border-white/6 pt-4">
        <Metric icon={Dumbbell} label="Kalan" value="3 Ders" valueClass="text-[#CCFF00]" />
        <Metric icon={CalendarClock} label="Geçerlilik" value="14 Gün" />
        <Metric icon={Wallet} label="Bakiye" value="₺0 · Ödendi" valueClass="text-[#10B981]" />
      </div>
    </section>
  )
}
