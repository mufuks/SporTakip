"use client"

import { useState } from "react"
import { AppHeader } from "@/components/app-header"
import { PackageCard } from "@/components/package-card"
import { SessionCard, type Session } from "@/components/session-card"
import { WorkoutTeaser } from "@/components/workout-teaser"
import { BottomNav } from "@/components/bottom-nav"
import { OtpSheet } from "@/components/otp-sheet"

const SESSIONS: Session[] = [
  {
    time: "19:00 - 20:00",
    title: "Fonksiyonel Güç & Kondisyon",
    trainer: "Gülçin Hoca",
    filled: 4,
    capacity: 6,
    status: "filling",
    lastCancel: "16:00",
  },
  {
    time: "20:00 - 21:00",
    title: "Core & Mobilite",
    trainer: "Sinan Hoca",
    filled: 6,
    capacity: 6,
    status: "full",
    waitlistPosition: 1,
  },
]

export default function Page() {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [tab, setTab] = useState("home")

  return (
    <div className="flex min-h-[100dvh] w-full justify-center bg-black">
      <main className="relative flex h-[100dvh] w-full max-w-[390px] flex-col overflow-hidden bg-[#0A0A0C] text-white">
        <div className="flex-1 overflow-y-auto pb-28">
          <AppHeader />

          <div className="space-y-5 px-5 pt-2">
            <PackageCard />

            <section>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-[17px] font-extrabold tracking-tight text-white">Günün Seansları</h2>
                <span className="text-[12px] font-medium text-white/45">Bugün, 21 Eylül</span>
              </div>
              <div className="space-y-3">
                {SESSIONS.map((s) => (
                  <SessionCard key={s.time} session={s} onBook={() => setSheetOpen(true)} />
                ))}
              </div>
            </section>

            <WorkoutTeaser />
          </div>
        </div>

        <BottomNav active={tab} onChange={setTab} />
        <OtpSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      </main>
    </div>
  )
}
