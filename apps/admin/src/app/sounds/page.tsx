"use client"

import { NoAccessToApp, useAdmin } from "@/components/shell/AdminShell"
import { SoundLibrary } from "@/components/sounds/SoundLibrary"
import { findNavGroup } from "@/lib/admin/me"
import { SOUNDS_APP, soundAbilities } from "@/lib/admin/sounds"

/**
 * Sound library (media:sounds.read; every write media:sounds.manage). A typed
 * URL without the permission, or without the library in the admin's
 * navigation, gets the same refusal as any other area they cannot open.
 */
export default function SoundLibraryPage() {
  const { me, nav } = useAdmin()
  const can = soundAbilities(me)
  if (!findNavGroup(nav, SOUNDS_APP) || !can.page) return <NoAccessToApp />
  return <SoundLibrary can={can} />
}
