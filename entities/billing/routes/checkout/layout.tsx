// The stylesheets this route needs are imported by the thin app/checkout
// layout: they live under app/styles, and an entity never reaches into app/
// (design §3 rule 3). What belongs to billing is the layout itself.
export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children
}
