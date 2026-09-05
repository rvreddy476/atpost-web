"use client"

/**
 * Design-system sandbox — every control @atpost/ui ships, rendered in a valid
 * and an error state side by side. Reachable at /admin/ui.
 *
 * The plan asked for this at `app/_ui/page.tsx`, but the App Router treats a
 * leading underscore as a private folder and drops it from routing entirely,
 * so the page would never have rendered. Same idea, routable path.
 *
 * Not linked from AdminNav on purpose: this step is not allowed to change what
 * an existing screen renders.
 */

import { useState } from "react"
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  DatePicker,
  EmailField,
  Input,
  MultiSelect,
  NumberInput,
  RadioGroup,
  Select,
  Switch,
  Table,
  Tabs,
  TBody,
  TD,
  Textarea,
  TH,
  THead,
  ToastProvider,
  TR,
  Tree,
  useToast,
  type TreeNode,
} from "@atpost/ui"

const COLOURS = [
  { value: "black", label: "Black" },
  { value: "white", label: "White" },
  { value: "navy", label: "Navy" },
  { value: "olive", label: "Olive" },
]

// Past ten options MultiSelect grows a search box — this list is here to show it.
const MATERIALS = [
  "Cotton",
  "Linen",
  "Wool",
  "Silk",
  "Denim",
  "Leather",
  "Polyester",
  "Nylon",
  "Rayon",
  "Bamboo",
  "Hemp",
  "Cashmere",
].map((m) => ({ value: m.toLowerCase(), label: m }))

const CATEGORY_TREE: TreeNode[] = [
  {
    id: "fashion",
    label: "Fashion",
    meta: "412 products",
    children: [
      {
        id: "mens",
        label: "Men's clothing",
        meta: "168 products",
        children: [
          { id: "shirts", label: "Shirts", meta: "94 products" },
          { id: "trousers", label: "Trousers", meta: "74 products" },
        ],
      },
      { id: "womens", label: "Women's clothing", meta: "244 products" },
    ],
  },
  {
    id: "electronics",
    label: "Electronics",
    meta: "1,208 products",
    children: [{ id: "audio", label: "Audio", meta: "310 products" }],
  },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">{children}</CardContent>
    </Card>
  )
}

function Sandbox() {
  const { toast, success, error: errorToast } = useToast()

  const [text, setText] = useState("Acme Industries")
  const [email, setEmail] = useState("seller@example.com")
  const [date, setDate] = useState("2026-09-06")
  const [colour, setColour] = useState("navy")
  const [materials, setMaterials] = useState<string[]>(["cotton", "linen"])
  const [inStock, setInStock] = useState(true)
  const [featured, setFeatured] = useState(false)
  const [blurb, setBlurb] = useState("A comfortable everyday shirt.")
  const [pack, setPack] = useState<number | null>(3)
  const [weight, setWeight] = useState<number | null>(250)
  const [fulfilment, setFulfilment] = useState("self")
  const [tab, setTab] = useState("basics")
  const [tree, setTree] = useState(CATEGORY_TREE)
  const [selected, setSelected] = useState<string | null>("mens")

  function reorder(nodeId: string, direction: -1 | 1) {
    // Depth-first swap within whichever sibling list holds the node.
    const move = (nodes: TreeNode[]): TreeNode[] => {
      const index = nodes.findIndex((n) => n.id === nodeId)
      if (index !== -1) {
        const next = [...nodes]
        const target = index + direction
        if (target < 0 || target >= next.length) return nodes
        ;[next[index], next[target]] = [next[target], next[index]]
        return next
      }
      return nodes.map((n) => (n.children ? { ...n, children: move(n.children) } : n))
    }
    setTree(move)
  }

  return (
    <div className="pb-16">
      <h1 className="mb-1 text-xl font-semibold">Design system sandbox</h1>
      <p className="mb-6 text-sm text-gray-500">
        Every @atpost/ui control, valid on the left and in its error state on the right.
      </p>

      <Section title="Input, EmailField, DatePicker, Select">
        <div className="flex flex-col gap-4">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Store name" />
          <EmailField value={email} onChange={setEmail} />
          <DatePicker label="Launch date" value={date} onChange={setDate} />
          <Select
            label="Colour"
            value={colour}
            onChange={setColour}
            options={COLOURS}
            placeholder="Choose a colour"
            description="The variant axis buyers filter on."
          />
        </div>
        <div className="flex flex-col gap-4">
          <Input value="" onChange={() => {}} placeholder="Store name" invalid />
          <EmailField value="not-an-email" onChange={() => {}} error="Enter a valid email address" />
          <DatePicker label="Launch date" value="" onChange={() => {}} error="Pick a date" />
          <Select
            label="Colour"
            value=""
            onChange={() => {}}
            options={COLOURS}
            placeholder="Choose a colour"
            required
            error="Colour is required"
          />
        </div>
      </Section>

      <Section title="MultiSelect">
        <MultiSelect
          label="Materials"
          value={materials}
          onChange={setMaterials}
          options={MATERIALS}
          maxSelections={3}
          description="Twelve options, so the menu grows a search box."
        />
        <MultiSelect
          label="Materials"
          value={[]}
          onChange={() => {}}
          options={MATERIALS.slice(0, 4)}
          required
          error="Pick at least one material"
        />
      </Section>

      <Section title="Checkbox and Switch">
        <div className="flex flex-col gap-4">
          <Checkbox
            label="In stock"
            description="Buyers can order this right now."
            checked={inStock}
            onChange={setInStock}
          />
          <Switch
            label="Feature on the shop home"
            description="Shown in the curated row above the fold."
            checked={featured}
            onChange={setFeatured}
          />
          <Switch label="Disabled switch" checked={false} onChange={() => {}} disabled />
        </div>
        <div className="flex flex-col gap-4">
          <Checkbox
            label="Accept the seller terms"
            description="Required before a listing can go live."
            checked={false}
            onChange={() => {}}
            error="You must accept the terms"
          />
          <Switch
            label="Feature on the shop home"
            checked={false}
            onChange={() => {}}
            error="Only approved sellers can be featured"
          />
        </div>
      </Section>

      <Section title="Textarea and NumberInput">
        <div className="flex flex-col gap-4">
          <Textarea
            label="Description"
            value={blurb}
            onChange={setBlurb}
            maxLength={200}
            showCounter
            description="Grows as you type, up to twelve rows."
          />
          <NumberInput label="Pack size" mode="integer" value={pack} onChange={setPack} min={1} max={24} />
          <NumberInput
            label="Net weight"
            mode="decimal"
            value={weight}
            onChange={setWeight}
            step={10}
            unit="g"
          />
        </div>
        <div className="flex flex-col gap-4">
          <Textarea
            label="Description"
            value=""
            onChange={() => {}}
            maxLength={200}
            showCounter
            required
            error="Description is required"
          />
          <NumberInput
            label="Pack size"
            mode="integer"
            value={0}
            onChange={() => {}}
            min={1}
            error="Pack size must be at least 1"
          />
          <NumberInput
            label="Net weight"
            mode="decimal"
            value={null}
            onChange={() => {}}
            unit="g"
            error="Net weight is required"
          />
        </div>
      </Section>

      <Section title="RadioGroup">
        <RadioGroup
          label="Fulfilment"
          value={fulfilment}
          onChange={setFulfilment}
          options={[
            { value: "self", label: "I ship it myself", description: "You pack and hand over." },
            { value: "atpost", label: "atPost fulfils", description: "We store and ship for you." },
            { value: "pickup", label: "Buyer collects", disabled: true },
          ]}
        />
        <RadioGroup
          label="Fulfilment"
          value=""
          onChange={() => {}}
          required
          error="Choose a fulfilment method"
          options={[
            { value: "self", label: "I ship it myself" },
            { value: "atpost", label: "atPost fulfils" },
          ]}
        />
      </Section>

      <Section title="Tabs">
        <div className="md:col-span-2">
          <Tabs
            aria-label="Listing groups"
            value={tab}
            onChange={setTab}
            items={[
              { id: "basics", label: "Basics", badge: "4 / 4" },
              { id: "specs", label: "Specifications", badge: "1 / 6" },
              { id: "shipping", label: "Shipping", badge: "0 / 2", invalid: true },
              { id: "seo", label: "SEO", disabled: true },
            ]}
          >
            <p className="text-sm text-gray-600">
              Panel for <span className="font-medium">{tab}</span>. Arrow keys move between tabs.
            </p>
          </Tabs>
        </div>
      </Section>

      <Section title="Table">
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-gray-400">Populated</p>
          <Table>
            <THead>
              <TR>
                <TH>Title</TH>
                <TH>Approval</TH>
                <TH className="text-right">Action</TH>
              </TR>
            </THead>
            <TBody>
              {[
                { id: "1", title: "Everyday Wireless Headphones", status: "submitted" },
                { id: "2", title: "Linen Shirt — Olive", status: "live" },
              ].map((row) => (
                <TR key={row.id}>
                  <TD className="font-medium">{row.title}</TD>
                  <TD className="text-gray-600">{row.status}</TD>
                  <TD className="text-right">
                    <span className="text-xs text-gray-400">—</span>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-gray-400">Loading</p>
            <Table loading>
              <TBody />
            </Table>
          </div>
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-gray-400">Empty</p>
            <Table empty emptyMessage="No products awaiting review.">
              <TBody />
            </Table>
          </div>
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-gray-400">Error</p>
            <Table error="Could not load the queue. Retry in a moment.">
              <TBody />
            </Table>
          </div>
        </div>
      </Section>

      <Section title="Tree">
        <div className="md:col-span-2">
          <Tree
            aria-label="Categories"
            nodes={tree}
            defaultExpandedIds={["fashion", "mens"]}
            selectedId={selected}
            onSelect={(node) => setSelected(node.id)}
            onReorder={(node, direction) => reorder(node.id, direction)}
            renderActions={(node) => (
              <Button size="sm" variant="ghost" onClick={() => toast({ title: `Edit ${node.id}` })}>
                Edit
              </Button>
            )}
          />
        </div>
      </Section>

      <Section title="Toast">
        <div className="md:col-span-2 flex flex-wrap gap-2">
          <Button onClick={() => success("Seller approved", "They can list products now.")}>
            Success
          </Button>
          <Button
            variant="destructive"
            onClick={() => errorToast("Approval failed", "The gateway returned 502. Nothing changed.")}
          >
            Error (stays until dismissed)
          </Button>
          <Button variant="outline" onClick={() => toast({ title: "Saved", variant: "info" })}>
            Info
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast({
                title: "Payout queued",
                description: "It will settle in two working days.",
                variant: "warning",
                action: { label: "Undo", onClick: () => success("Payout cancelled") },
              })
            }
          >
            Warning with action
          </Button>
        </div>
      </Section>
    </div>
  )
}

export default function UiSandboxPage() {
  // Provider lives here rather than in the admin layout: mounting it globally
  // would change what every existing screen renders, which this step may not do.
  return (
    <ToastProvider>
      <Sandbox />
    </ToastProvider>
  )
}
