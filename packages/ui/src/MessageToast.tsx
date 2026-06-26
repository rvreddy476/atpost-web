"use client"

import React from "react"

interface MessageToastProps {
    senderAvatar: string
    senderName: string
    messagePreview: string
    timestamp: string
    onClick?: () => void
}

export function MessageToastContent({
    senderAvatar,
    senderName,
    messagePreview,
    timestamp,
    onClick,
}: MessageToastProps) {
    const truncated =
        messagePreview.length > 60
            ? messagePreview.slice(0, 60) + "\u2026"
            : messagePreview

    return (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-brand-secondary/50 transition-colors rounded-2xl"
        >
            <div className="w-9 h-9 rounded-xl overflow-hidden border border-white shadow-sm flex-shrink-0">
                <img
                    src={senderAvatar}
                    alt={senderName}
                    className="w-full h-full object-cover"
                />
            </div>
            <div className="min-w-0 flex-1 pr-6">
                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-black text-brand-text tracking-tight truncate">
                        {senderName}
                    </span>
                    <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest flex-shrink-0">
                        {timestamp}
                    </span>
                </div>
                <p className="text-[11px] text-brand-highlight leading-snug mt-0.5 line-clamp-2">
                    {truncated}
                </p>
            </div>
        </button>
    )
}
