# Glossary Map

Each entity under `entities/` is its own context with its own language. A context gets a
`GLOSSARY.md` beside its code when its first term is settled; the rest are added as that happens.

## Contexts

- [Training](./entities/training/GLOSSARY.md): taught sessions, self-logged trainings, attendance, reviews and homework
- [Quests](./entities/quests/GLOSSARY.md): bounties, raids and beacons people take on, and the Lore of discoveries they leave
- [Ladders](./entities/ladders/GLOSSARY.md): two private ladders a person climbs by acting, the emblems and borders they may wear, and the badges they find

## Relationships

- **Quests → Training**: a Raid's session is a Training taught session; Quests shows it, Training owns it
- **Quests → Ideas**: a Discovery is a learning spark; Quests posts one through the Ideas door and reads the Lore from it, Ideas owns it
- **Ladders → Quests**: a Turn-in on a Bounty and a Beacon lit are Acts on the Learn & Share ladder; Ladders reads them through the Quests door; Quests owns them and never imports Ladders (its faces get their Borders from the kernel)
- **Ladders → Ideas**: a spark or a learning in Spark is an Act on the Learn & Share ladder; Ideas owns it
- **Ladders → Boards**: a leaf card moved to Done is an Act on the Builder ladder, credited to its assignee; Boards owns the card
- **Ladders → Training**: a Raid's session that someone attended is an Act for its Host; Training owns the session and its register
- **Ladders → Team**: the profile and the postcard are the Team's pages; they wear what Ladders says a person chose to show, and nothing more
