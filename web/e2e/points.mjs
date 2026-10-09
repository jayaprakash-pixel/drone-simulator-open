// Published reference points shared by the data-accuracy and click-accuracy checks (retrieved 2026-10-08).
// Heights come from Wikidata (each claim carries a reference; the airports are surveyed elevations). Hill positions come from
// OpenStreetMap: Wikidata's own Guru Shikhar position is 1.8 km off the summit and reads 346 m low.
export const POINTS = [
  { name: 'Guru Shikhar summit, Mount Abu', lat: 24.6499484, lon: 72.7763375, published: 1722, source: 'Wikidata Q3533921 (height), OpenStreetMap node 3577976686 (position)' },
  { name: 'Jaipur', lat: 26.915, lon: 75.82, published: 431, source: 'Wikidata Q66485' },
  { name: 'Jaisalmer', lat: 26.916667, lon: 70.916667, published: 225, source: 'Wikidata Q242898' },
  { name: 'Jaipur airport', lat: 26.824167, lon: 75.812222, published: 385, source: 'Wikidata Q572387' },
  { name: 'Jaisalmer airport', lat: 26.880278, lon: 70.855, published: 251, source: 'Wikidata Q2900727' },
];
