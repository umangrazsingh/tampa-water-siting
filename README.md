# Tampa Water Siting

Where should USF Tampa harvest rainwater and build solar shade first?

Live: https://tampa-water-siting.app.space

The app ranks every building roof and parking lot on the USF Tampa campus by estimated
rainwater capture, solar output and shade value. You change the weights, save a
shortlist, draft a proposal for a site, and email it to yourself.

It started from a hackathon project, BULLS ECOOPS (HackJam '26, SHPE USF), built with
Kruthika and Aryan. This is a new, smaller build for DeepSpace, not a copy of that repo.

## How it works

1. The browser loads roof and parking-lot shapes from USF's public ArcGIS layers
   (`src/lib/sites.ts`), limited to a bounding box around the Tampa campus.
2. Each shape's area is measured with Turf. Rainwater and solar output are then
   estimated from stated assumptions (shown at the bottom of the page).
3. Each site gets a percentile on each metric (the share of sites it beats), which is
   multiplied by the slider weights and summed into a 0-100 score (`rankSites`).
   Percentiles are used instead of scaling by the biggest site, because a few huge lots
   otherwise flatten everyone else and the sliders barely reorder the list.
4. The map (MapLibre GL) colors shapes by score. Clicking a site, on the map or in the
   list, highlights it in red and shows its details.
5. Signed-in users save sites to a shortlist (a DeepSpace record collection, owner-only),
   draft a proposal, and email it to themselves.

All numbers are screening estimates, not measurements. Only the areas are measured.
The three factors measure different things, so the sliders pick different winners:

- **Water** counts roof rain only (`runoffRoof` 0.9). Lots shed rain too (`runoffLot` 0.8),
  but it carries oil and grit, so `lotRunoffHarvested` is 0 and lots score no water.
- **Solar** is usable panel area: 30% of a roof (`usableRoof`) or 60% of a lot as a canopy
  (`usableLot`), times 0.2 kW/m2 and 1,500 kWh per kW per year.
- **Shade** is the parked cars a lot canopy would cover: the lot's listed `LOT_SPACES`
  times `m2PerParkingSpace` (30 m2). Lots with no listed spaces are estimated as area / 30 m2.
  Roofs score no shade.

Building height is not in USF's data (`BLDGHEIGHT` is empty), so it is not used.

## DeepSpace pieces used

- Auth, the record database and permissions: the `shortlist` collection
  (`src/schemas/shortlist-schema.ts`). Each user can read and edit only their own rows.
- Integrations (called with `integration.post` in `src/lib/proposal.ts`):
  - `anthropic/chat-completion` drafts the proposal from the facts the app supplies.
  - `openweathermap/forecast` gives a five-day Tampa outlook. It returns descriptions
    only, no rainfall amounts, so the app counts rainy periods instead of inventing mm.
  - `email/send` emails the proposal to the signed-in user.

Integrations left out on purpose: search, social, finance and media tools. None of
them improves a campus siting tool.

## Run it

```
npm install
npx deepspace auth login
npx deepspace dev start
npm run validate      # type check + unit tests
npx deepspace deploy
```

## Tradeoffs and what is unfinished

- Campus data loads in the browser straight from USF's service. That is simple and always
  current, but the page depends on that service being up. Next step: a Worker route that
  fetches and caches it.
- The map's background worker is started from a blob: URL (`src/components/CampusMap.tsx`)
  because the host served the worker file with a MIME type browsers refuse.
- AI proposals are constrained to the supplied facts, but the model can still add small
  claims, so every proposal lists "What to verify first". Next step: validate drafts
  against the facts before saving.
- Not done: per-user saved weights, rate limits on paid integration calls, and PDF export.
