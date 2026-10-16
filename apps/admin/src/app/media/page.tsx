import { redirect } from "next/navigation"

/** `media` is the sound library's permission scope; its page lives at /sounds. */
export default function MediaPage() {
  redirect("/sounds")
}
