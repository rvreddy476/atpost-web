import { describe, expect, it } from "vitest"
import { circleBoundary, zoneSlug } from "./zoneCoverage"
describe("working zone geometry",()=>{
 it("creates a closed, valid 5 km circle in longitude/latitude order",()=>{
  const shape=circleBoundary({lat:17.4,lng:78.6},5000),ring=shape.coordinates[0]
  expect(shape.type).toBe("Polygon");expect(ring).toHaveLength(97)
  expect(ring[0]).toEqual(ring[96])
  expect(ring[0][0]).toBeCloseTo(78.6,5)
  expect(ring[0][1]).toBeGreaterThan(17.44)
  expect(ring.every(p=>p[0]>78&&p[0]<79&&p[1]>17&&p[1]<18)).toBe(true)
 })
 it("refuses invalid positions and unsupported radii",()=>{
  for(const radius of [0,999,50001,NaN])expect(()=>circleBoundary({lat:17,lng:78},radius)).toThrow()
  expect(()=>circleBoundary({lat:91,lng:78},5000)).toThrow()
  expect(()=>circleBoundary({lat:0,lng:179.99},50000)).toThrow()
 })
 it("creates stable readable slugs",()=>{expect(zoneSlug("Uppal & Nearby")).toBe("uppal-nearby")})
})
