"use client"

import { useMemo, useState, useEffect, useRef } from "react"

interface DobPickerProps {
    value: string                // YYYY-MM-DD (or empty)
    onChange: (value: string) => void
    error?: string               // validation message from parent
    selectClassName?: string     // overrides per-select styling
    required?: boolean
}

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

function daysInMonth(month: number, year: number) {
    return new Date(year, month, 0).getDate()
}

function parse(value: string) {
    const date = value ? value.split("T")[0] : ""
    const [y, m, d] = date.split("-")
    return {
        year:  parseInt(y, 10) || 0,
        month: parseInt(m, 10) || 0,
        day:   parseInt(d, 10) || 0,
    }
}

function fmt(year: number, month: number, day: number): string {
    if (!year || !month || !day) return ""
    const maxDay = daysInMonth(month, year)
    const d = Math.min(day, maxDay)
    return [
        String(year).padStart(4, "0"),
        String(month).padStart(2, "0"),
        String(d).padStart(2, "0"),
    ].join("-")
}

/** Returns null if valid, or an error string. */
export function validateDob(value: string, minAge = 13): string | null {
    if (!value) return "Date of birth is required"
    const { year, month, day } = parse(value)
    if (!year || !month || !day) return "Please select a complete date"
    const dob = new Date(year, month - 1, day)
    const today = new Date()
    const age = today.getFullYear() - dob.getFullYear() -
        (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0)
    if (age < minAge) return `You must be at least ${minAge} years old`
    if (age > 120) return "Please enter a valid date of birth"
    return null
}

export function DobPicker({ value, onChange, error, selectClassName, required }: DobPickerProps) {
    const [year,  setYear]  = useState(() => parse(value).year)
    const [month, setMonth] = useState(() => parse(value).month)
    const [day,   setDay]   = useState(() => parse(value).day)
    const [touched, setTouched] = useState(false)

    // Sync from prop when parent changes it externally (e.g. profile data loads)
    const prevValue = useRef(value)
    useEffect(() => {
        if (value !== prevValue.current) {
            prevValue.current = value
            const p = parse(value)
            setYear(p.year)
            setMonth(p.month)
            setDay(p.day)
        }
    }, [value])

    const currentYear = new Date().getFullYear()
    const years = useMemo(() => {
        const arr: number[] = []
        for (let y = currentYear - 13; y >= currentYear - 100; y--) arr.push(y)
        return arr
    }, [currentYear])

    const days = useMemo(() => {
        const count = month && year ? daysInMonth(month, year) : 31
        return Array.from({ length: count }, (_, i) => i + 1)
    }, [month, year])

    const emit = (y: number, m: number, d: number) => {
        const result = fmt(y, m, d)
        if (result) onChange(result)
    }

    const handleMonth = (val: number) => { setTouched(true); setMonth(val); emit(year,  val,   day)   }
    const handleDay   = (val: number) => { setTouched(true); setDay(val);   emit(year,  month, val)   }
    const handleYear  = (val: number) => { setTouched(true); setYear(val);  emit(val,   month, day)   }

    // Inline incomplete-selection warning (only after user has touched at least one field)
    const isPartial = touched && (!month || !day || !year)
    const displayError = error || (isPartial ? "Please complete all three fields" : undefined)

    const hasError = !!displayError
    const base = selectClassName ??
        "rounded-xl border bg-brand-card px-3 py-2 text-sm font-medium text-brand-text outline-none cursor-pointer transition-all focus:ring-2 appearance-none"
    const borderCls = hasError
        ? "border-rose-400 focus:ring-rose-400/20 focus:border-rose-500"
        : "border-brand-divider focus:ring-brand-accent/20 focus:border-brand-accent"

    return (
        <div className="space-y-1.5">
            <div className="flex gap-2">
                <select
                    value={month || ""}
                    onChange={(e) => handleMonth(+e.target.value)}
                    aria-label="Month"
                    aria-invalid={hasError}
                    required={required}
                    className={`${base} ${borderCls} flex-1`}
                >
                    <option value="">Month</option>
                    {MONTHS.map((name, i) => (
                        <option key={i + 1} value={i + 1}>{name}</option>
                    ))}
                </select>

                <select
                    value={day || ""}
                    onChange={(e) => handleDay(+e.target.value)}
                    aria-label="Day"
                    aria-invalid={hasError}
                    required={required}
                    className={`${base} ${borderCls} w-[70px]`}
                >
                    <option value="">Day</option>
                    {days.map((d) => (
                        <option key={d} value={d}>{d}</option>
                    ))}
                </select>

                <select
                    value={year || ""}
                    onChange={(e) => handleYear(+e.target.value)}
                    aria-label="Year"
                    aria-invalid={hasError}
                    required={required}
                    className={`${base} ${borderCls} w-[95px]`}
                >
                    <option value="">Year</option>
                    {years.map((y) => (
                        <option key={y} value={y}>{y}</option>
                    ))}
                </select>
            </div>

            {displayError && (
                <p className="text-[11px] font-semibold text-rose-500">{displayError}</p>
            )}
        </div>
    )
}
