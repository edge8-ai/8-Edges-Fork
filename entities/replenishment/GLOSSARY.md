# Replenishment

Refilling a warehouse's pick BINs from its reserve stock, one weekly round at a time. Every rule is
a warehouse's own, held as data in a profile; the code names no brand, client or BIN scheme.

**Profile**:
One warehouse's rules: which export columns to read, its zones, what is always left out, its item
rules and bands, how many destinations to suggest, and the words the operator's screen uses.
_Avoid_: config, settings, spec

**Zone**:
A family of BINs whose codes match one pattern, either **pick** (where pickers take orders from)
or **reserve** (where stock waits: shelves above the aisles, pallets). A location that fits no zone
is ignored.
_Avoid_: area, section

**Walking order**:
The order an operator passes BINs: zones by rank, then the numbered parts of the BIN code (aisle,
bay, shelf). Collection lists, destinations and jobs all follow it.
_Avoid_: path order, sort order

**Item rule**:
Which items a product line covers, what each must carry to be read (such as a UK size), and how to
read its size. The first rule an item meets decides it.

**Band**:
A size range within an item rule, with the level that triggers a restock and the amount to move. A
band's amount is either set, or a **choice** the operator makes at the shelf (such as by box size),
each option capped at what reserve holds.

**Run**:
The jobs one stock export produced against one profile, built once at upload and never re-built.
_Avoid_: report, sheet

**Job**:
One item to restock: where to collect it from, how much to move, and which pick BINs to try.

**Collect from**:
Every reserve location holding the item, in walking order.

**Destination**:
A suggested pick BIN, one that already holds the item. The operator may use any BIN.

**Left out**:
An item held in reserve that the profile could not read, listed with the reason. Never guessed,
never silently dropped.

**Offline copy**:
A run downloaded as one self-contained HTML file, for scanners with no signal. Its progress stays
in that browser and is never sent back. The file keeps the name the first client's template used,
`Replenishment_Report_YYYY-MM-DD.html`, so operators recognise it.

Avoid the first client's own words in code: "Pickface" and "Excess" are set in a profile's words.
