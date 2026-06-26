import { Button, Card, CardHeader, CardTitle, CardContent } from "@atpost/ui"

// Placeholder home for the commerce zone — proves the shared design system
// renders here. Replace with the real routes (cart, checkout, orders, products,
// seller, rfq) moved out of postbook-ui src/app/.
export default function ShopHome() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <Card>
        <CardHeader>
          <CardTitle>Commerce zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-brand-text/70">
            Independent <code>/shop</code> Multi-Zone, deployed & scaled on its
            own, using <code>@atpost/ui</code> + <code>@atpost/api-client</code>.
            Drop the commerce routes into <code>src/app/</code>.
          </p>
          <Button>Shared Button from @atpost/ui</Button>
        </CardContent>
      </Card>
    </main>
  )
}
