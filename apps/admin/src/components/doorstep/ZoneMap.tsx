"use client"

import { useEffect, useRef, useState } from "react"
import { buttonSecondary } from "@/components/blocks/buttons"
import { loadGoogleMaps, selectedPlace, type MapPoint, type GoogleMap, type Circle, type MapsLibrary, type PlacesLibrary, type GooglePlace } from "@/lib/maps/google"

export function ZoneMap({ point, radiusM, onSelect }: { point: MapPoint | null; radiusM: number; onSelect: (point: MapPoint, label?: string) => void }) {
  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState("")
  const host = useRef<HTMLDivElement>(null), searchHost = useRef<HTMLDivElement>(null)
  const map = useRef<GoogleMap | null>(null), maps = useRef<MapsLibrary | null>(null), circle = useRef<Circle | null>(null)
  const select = useRef(onSelect); select.current = onSelect
  const currentPoint = useRef(point); currentPoint.current = point
  useEffect(() => {
    if (!open) return
    let cancelled = false, version = 0
    let listener: { remove(): void } | undefined
    let search: HTMLElement | undefined
    void (async () => {
      try {
        const google = await loadGoogleMaps()
        const lib = { ...await google.maps.importLibrary("maps") as object, ...await google.maps.importLibrary("core") as object } as MapsLibrary
        if (cancelled || !host.current) return
        maps.current = lib
        map.current = new lib.Map(host.current, { center: currentPoint.current ?? { lat: 20.5937, lng: 78.9629 }, zoom: currentPoint.current ? 12 : 5, renderingType: "RASTER", streetViewControl: false, mapTypeControl: false, gestureHandling: "cooperative" })
        listener = lib.event.addListener(map.current, "click", e => { version++; if(e.latLng) select.current({lat:e.latLng.lat(),lng:e.latLng.lng()}) })
        setReady(true)
        const places = await google.maps.importLibrary("places") as PlacesLibrary
        if (cancelled || !searchHost.current) return
        search = new places.PlaceAutocompleteElement({ includedRegionCodes: ["in"] })
        search.setAttribute("aria-label", "Search town or neighbourhood")
        search.style.width = "100%"
        searchHost.current.replaceChildren(search)
        search.addEventListener("gmp-error", () => !cancelled && setError("Area search is unavailable. Select the centre on the map."))
        search.addEventListener("gmp-select", async event => {
          const request = ++version
          try {
            const place = (event as Event & {placePrediction: {toPlace(): GooglePlace}}).placePrediction.toPlace()
            await place.fetchFields({fields:["location","formattedAddress","addressComponents"]})
            if(cancelled || request !== version) return
            const selected = selectedPlace(place)
            if(selected) {select.current(selected,selected.address);setError("")}
          } catch {if(!cancelled && request === version) setError("This location could not be loaded. Try another result.")}
        })
      } catch(e) {if(!cancelled) setError(e instanceof Error ? e.message : "Map could not be loaded.")}
    })()
    return () => {cancelled=true;listener?.remove();search?.remove();circle.current?.setMap(null);map.current=null}
  },[open])
  useEffect(() => {
    if(!ready || !map.current || !maps.current || !point) return
    circle.current?.setMap(null)
    circle.current = new maps.current.Circle({map:map.current,center:point,radius:radiusM,fillColor:"#2563eb",fillOpacity:.12,strokeColor:"#2563eb",strokeWeight:2,clickable:false})
    map.current.setCenter(point)
    map.current.setOptions({zoom:Math.max(8,14-Math.log2(radiusM/1000))})
  },[point,radiusM,ready])
  return <section className="overflow-hidden rounded-xl border border-mo bg-mo-sunken" aria-label="Zone coverage map">
    {!open ? <div className="space-y-3 p-5"><p className="text-sm text-mo-body">Find a town or neighbourhood, then set its coverage radius.</p><button type="button" className={buttonSecondary} onClick={()=>setOpen(true)}>Search on Google Maps</button><p className="text-xs text-mo-body">Opening the map shares your search and selected area with Google.</p></div> : <><div className="p-3" ref={searchHost}/><div ref={host} className="h-80 w-full" role="region" aria-label="Select zone centre"/>{!ready&&!error&&<p className="p-3 text-sm" role="status">Loading map…</p>}</>}
    {error&&<p role="alert" className="p-3 text-sm text-mo-bad">{error}</p>}
  </section>
}
