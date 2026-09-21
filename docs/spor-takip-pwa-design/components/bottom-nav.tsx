"use client"

import { Home, CalendarDays, Activity, User } from "lucide-react"

const TABS = [
  { id: "home", label: "Ana Sayfa", icon: Home },
  { id: "sessions", label: "Seanslar", icon: CalendarDays },
  { id: "workout", label: "Antrenmanım", icon: Activity },
  { id: "profile", label: "Profilim", icon: User },
] as const

export function BottomNav({
  active,
  onChange,
}: {
  active: string
  onChange: (id: string) => void
}) {
  return (
    <nav className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 pb-5">
      <div className="pointer-events-auto flex items-center justify-around rounded-2xl border border-white/10 bg-[#141418]/80 px-2 py-2 shadow-[0_10px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        {TABS.map((tab) => {
          const isActive = active === tab.id
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              aria-current={isActive ? "page" : undefined}
              className="relative flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5"
            >
              <Icon
                className={`h-[22px] w-[22px] transition-colors ${isActive ? "text-[#CCFF00]" : "text-white/45"}`}
                strokeWidth={isActive ? 2.4 : 2}
              />
              <span
                className={`text-[10px] font-semibold tracking-tight transition-colors ${
                  isActive ? "text-[#CCFF00]" : "text-white/45"
                }`}
              >
                {tab.label}
              </span>
              {isActive && (
                <span className="absolute -top-1 h-1 w-1 rounded-full bg-[#CCFF00] shadow-[0_0_8px_rgba(204,255,0,0.7)]" />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
