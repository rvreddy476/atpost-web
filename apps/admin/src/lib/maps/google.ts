// Browser-only key. Never substitute GOOGLE_MAPS_SERVER_KEY here.
export type MapPoint = { lat: number; lng: number }
export type SelectedPlace = MapPoint & { address: string; city: string; state: string; postalCode: string; locality: string }
type AddressComponent = { longText: string; shortText?: string; types: string[] }
export type GooglePlace = { location?: { lat(): number; lng(): number }; formattedAddress?: string; addressComponents?: AddressComponent[]; fetchFields(o: unknown): Promise<void> }
export function validPoint(value: unknown): value is MapPoint {
  if (!value || typeof value !== "object") return false
  const p = value as MapPoint
  return typeof p.lat === "number" && typeof p.lng === "number" && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180
}
export function selectedPlace(place: { location?: { lat(): number; lng(): number }; formattedAddress?: string; addressComponents?: AddressComponent[] }): SelectedPlace | null {
  const point = place.location && { lat: place.location.lat(), lng: place.location.lng() }
  if (!validPoint(point)) return null
  const components = place.addressComponents ?? []
  const part = (...types: string[]) => components.find((c) => types.some((t) => c.types.includes(t)))?.longText ?? ""
  return { ...point, address: place.formattedAddress ?? "", city: part("locality", "administrative_area_level_2"), state: part("administrative_area_level_1"), postalCode: part("postal_code"), locality: part("sublocality_level_1", "sublocality", "locality") }
}
export type GoogleMap = { setCenter(p: MapPoint): void; fitBounds(b: unknown): void; setOptions(o: unknown): void }
export type Circle = { setMap(m: GoogleMap | null): void }
export type MapsLibrary = {
  Map: new (el: HTMLElement, options: unknown) => GoogleMap
  Circle: new (options: unknown) => Circle
  LatLngBounds: new () => { extend(p: MapPoint): void }
  event: { addListener(instance: unknown, name: string, callback: (e: { latLng?: { lat(): number; lng(): number } }) => void): { remove(): void } }
}
// Maps requires hex colours: convert the existing Momentum RGB tokens, not a second palette.
export function tokenHex(raw: string): string {
  const values = raw.trim().split(/[\s,]+/).map(Number)
  if (values.length !== 3 || values.some((v) => !Number.isFinite(v) || v < 0 || v > 255)) throw new Error("Map theme token unavailable")
  return `#${values.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`
}
export type PlacesLibrary = { PlaceAutocompleteElement: new (options: unknown) => HTMLElement }
type GoogleNamespace = { maps: { importLibrary(name: string): Promise<unknown> } }
declare global { interface Window { google?: GoogleNamespace; __momentumMapsLoaded?: () => void } }
let loading: Promise<GoogleNamespace> | undefined
export function loadGoogleMaps(): Promise<GoogleNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("Maps are available in the browser only."))
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google)
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim()
  if (!key) return Promise.reject(new Error("Google Maps is not configured yet. You can still enter your address manually."))
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script")
    const nonce = document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce
    if (nonce) {
      script.nonce = nonce
      // Google copies this nonce onto its own injected style elements.
      if (!document.querySelector("style[nonce]")) {
        const style = document.createElement("style")
        style.nonce = nonce
        document.head.appendChild(style)
      }
    }
    const fail = () => { clearTimeout(timeout); delete window.__momentumMapsLoaded; script.remove(); loading = undefined; reject(new Error("Google Maps could not load. Check your connection or enter the address manually.")) }
    const timeout = window.setTimeout(fail, 15_000)
    window.__momentumMapsLoaded = () => {
      clearTimeout(timeout); delete window.__momentumMapsLoaded
      if (window.google?.maps?.importLibrary) resolve(window.google)
      else fail()
    }
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key, v: "weekly", loading: "async", callback: "__momentumMapsLoaded" })}`
    script.async = true
    script.onerror = fail
    script.referrerPolicy = "strict-origin-when-cross-origin"
    document.head.appendChild(script)
  })
  return loading
}
