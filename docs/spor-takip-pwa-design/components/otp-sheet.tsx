"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { X, ShieldCheck, ArrowRight } from "lucide-react"

function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 10)
  const p = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 8), digits.slice(8, 10)].filter(Boolean)
  return p.join(" ")
}

function useCountdown(active: boolean, seconds: number) {
  const [remaining, setRemaining] = useState(seconds)
  useEffect(() => {
    if (!active) return
    setRemaining(seconds)
    const id = setInterval(() => setRemaining((r) => (r > 0 ? r - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [active, seconds])
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0")
  const ss = String(remaining % 60).padStart(2, "0")
  return `${mm}:${ss}`
}

export function OtpSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [step, setStep] = useState<"phone" | "code">("phone")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState<string[]>(["", "", "", "", "", ""])
  const inputsRef = useRef<Array<HTMLInputElement | null>>([])
  const timer = useCountdown(open && step === "code", 165)

  useEffect(() => {
    if (!open) {
      setStep("phone")
      setPhone("")
      setCode(["", "", "", "", "", ""])
    }
  }, [open])

  useEffect(() => {
    if (step === "code") {
      const t = setTimeout(() => inputsRef.current[0]?.focus(), 350)
      return () => clearTimeout(t)
    }
  }, [step])

  function handleCodeChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1)
    setCode((prev) => {
      const next = [...prev]
      next[index] = digit
      return next
    })
    if (digit && index < 5) inputsRef.current[index + 1]?.focus()
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputsRef.current[index - 1]?.focus()
    }
  }

  const phoneValid = phone.replace(/\D/g, "").length === 10
  const codeComplete = code.every((c) => c !== "")

  if (!open) return null

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Kapat"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm"
      />

      <div className="animate-sheet-up relative rounded-t-3xl border-t border-white/10 bg-[#111115] px-5 pb-8 pt-3">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-white/15" />

        <button
          type="button"
          aria-label="Kapat"
          onClick={onClose}
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/6 text-white/60 active:bg-white/10"
        >
          <X className="h-4.5 w-4.5" strokeWidth={2.25} />
        </button>

        <div className="mb-5 flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#CCFF00]/15 text-[#CCFF00]">
            <ShieldCheck className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <div>
            <h2 className="text-[18px] font-extrabold tracking-tight text-white">Sürtünmesiz OTP Girişi</h2>
            <p className="text-[12px] text-white/45">
              {step === "phone" ? "Telefon numaranı doğrula" : "Gelen 6 haneli kodu gir"}
            </p>
          </div>
        </div>

        {step === "phone" ? (
          <div className="animate-rise-in">
            <label htmlFor="phone" className="mb-2 block text-[12px] font-semibold text-white/50">
              Telefon Numarası
            </label>
            <div className="flex items-center gap-2 rounded-2xl border border-[#222228] bg-[#0A0A0C] px-4 py-3.5 focus-within:border-[#CCFF00]/50">
              <span className="font-mono text-[15px] font-bold text-white/60">+90</span>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="5XX XXX XX XX"
                value={formatPhone(phone)}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-transparent font-mono text-[15px] font-bold tracking-wide text-white placeholder:text-white/25 focus:outline-none"
              />
            </div>

            <button
              type="button"
              disabled={!phoneValid}
              onClick={() => setStep("code")}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#CCFF00] py-3.5 text-[15px] font-extrabold text-[#0A0A0C] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
            >
              Kod Gönder
              <ArrowRight className="h-4.5 w-4.5" strokeWidth={2.5} />
            </button>
          </div>
        ) : (
          <div className="animate-rise-in">
            <div className="flex justify-between gap-2">
              {code.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputsRef.current[i] = el
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleCodeChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  aria-label={`Kod hanesi ${i + 1}`}
                  className={`h-14 w-full rounded-2xl border bg-[#0A0A0C] text-center font-mono text-[22px] font-bold text-white transition-all focus:outline-none ${
                    digit
                      ? "border-[#CCFF00]/60 shadow-[0_0_12px_rgba(204,255,0,0.15)]"
                      : "border-[#222228] focus:border-[#CCFF00]/50"
                  }`}
                />
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-[12px] text-white/45">
                Kalan Süre: <span className="font-mono font-bold text-[#CCFF00]">{timer}</span>
              </p>
              <button type="button" className="text-[12px] font-semibold text-white/60 active:text-white">
                Tekrar Gönder
              </button>
            </div>

            <button
              type="button"
              disabled={!codeComplete}
              onClick={onClose}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#CCFF00] py-3.5 text-[15px] font-extrabold text-[#0A0A0C] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
            >
              Kodu Onayla
            </button>

            <button
              type="button"
              onClick={() => setStep("phone")}
              className="mt-3 w-full text-center text-[12px] font-medium text-white/40 active:text-white/60"
            >
              Numarayı değiştir
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
