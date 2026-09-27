# Tanzania administrative-location data

## Imported source and scope

The dataset is the **National Bureau of Statistics (NBS), Tanzania 2022 Population and Housing Census ward shapefile**, published on the NBS GIS page in 2024. All administrative attributes come directly from its DBF file; the application does not need the polygon geometry.

- Publisher/catalog: https://www.nbs.go.tz/statistics/topic/gis
- Official ZIP: https://www.nbs.go.tz/uploads/statistics/documents/en-1714652282-TANZANIA_2022PHC_WARD_SHAPEFILES.zip
- Supporting NBS metadata: https://microdata.nbs.go.tz/index.php/catalog/49/study-description
- Official administrative reports: https://www.nbs.go.tz/statistics/subtopic/administrative-reports
- Zanzibar census publications: https://www.ocgs.go.tz/census
- ZIP SHA-256: `a81eecf5021d1904d2d57a3c5ea40b8c3f538cd5b227e8d68a302653a6d1466e`

Coverage extracted from this source:

| Level | Count |
| --- | ---: |
| Regions | 31 |
| Districts (district codes, not councils) | 150 |
| Councils represented in ward metadata | 195 |
| Mainland wards | 3,956 |
| Zanzibar shehia | 388 |
| Total wards/shehia | 4,344 |

This is a **2022 census snapshot**, not certification that every subsequent gazetted change through 2026 has been incorporated. The NBS publication index found during research still points to this 2022 ward dataset. Later region-specific reports are not silently merged into a different national boundary vintage.

The NBS file separates `dist_code/dist_name` from `counc_code/counc_name`. Mtaa Connect uses actual source districts for the Region → District → Ward hierarchy. It does not turn each council into a district to inflate the district count. Zanzibar shehia are represented at the ward level and the UI label says `Kata / Shehia`.

## Other sources reviewed

The NBS site also lists 2012 ward and 2019 district archives, which are older than the selected census data. Its microdata catalog provides 2022 geodatabase metadata and downloadable material. OCGS publishes the corresponding Zanzibar census reports. Those sources are useful for provenance and later reconciliation, but their different formats/vintages are not concatenated into duplicate entries.

The community dataset at https://github.com/open-admin-data/tanzania-administrative-divisions advertises 31 regions, 170 districts and 3,643 wards. Its more recent repository date does not demonstrate a more complete/current administrative geography, and its coverage differs from the official NBS file. It was not used for this import. Secondary maps and search results were discovery aids only, not the source of database names.

## Data-quality decisions

All 4,344 source records are retained. Original spelling and capitalization are preserved after trimming DBF padding. Names are not title-cased or guessed from other sites.

Three ward names appear twice under the same district, each belonging to a different council:

- Tembela, Mbeya district: Mbeya district council and Mbeya city council.
- Maendeleo, Mbeya district: Mbeya district council and Mbeya city council.
- Mjimwema, Njombe district: Njombe town council and Makambako town council.

For those six rows only, the dropdown `name` includes the complete source council name in parentheses. The unmodified ward name remains in `official_name`, and the council is also in `source_metadata`. This preserves the existing unique `(district_id, name)` constraint without merging distinct places.

Five composite ward-code values are reused by different names in the same council in the official file (Newala, Kusini, Magharibi A and two in Shinyanga). They are preserved and documented, not corrected without evidence. Ward identity therefore uses the source `OBJECTID_1`, scoped to the pinned dataset, rather than assuming the ward code alone is unique. These feature IDs must not be treated as persistent identities across future NBS releases.

The exact anomaly records and regional coverage counts are in `data/locations/nbs-2022-provenance.json`. Original administrative attributes and display names are in `data/locations/nbs-2022-wards.json`.

## Reproducible import

1. Download the official ZIP into an ignored local folder such as `.artifacts/locations/`.
2. Run `python scripts/prepare-nbs-locations.py .artifacts/locations/nbs-2022-wards.zip` (Python 3, standard library only).
3. The script checks the pinned checksum, source encoding, parent consistency, feature-ID uniqueness, display-name uniqueness and expected coverage. It generates the JSON data/provenance and migration `202609250007_nbs_2022_locations.sql` from `scripts/templates/nbs-locations.sql`.
4. Run `npm run check`, review `supabase db push --dry-run`, then apply the reviewed migrations.

Migration `202609250006_location_provenance.sql` adds the RLS-protected `location_datasets` metadata table and nullable provenance columns to the existing location tables. Tenant/resident permissions are unchanged.

The data migration upserts by existing parent/name keys, preserving IDs and existing child relationships. It refuses conflicting coverage, preserves unrelated manual records, and records one import audit event. A database test replays it and checks IDs, counts and audit deduplication. Normal migration deployment applies each migration once; the replay test protects the import logic itself.

Do not modify already-applied migrations when updating the source. Obtain the new official release, compare administrative identities and boundaries, review reused/changed codes, and create a new migration with explicit remapping where needed. Do not delete locations referenced by residents or Mitaa.

Mtaa/street and Balozi records are not contained in this ward archive and are not invented. Add genuine local areas below an imported ward through the administrator UI. If using the existing reviewed hierarchy importer, use the qualified dropdown name for the six disambiguated wards.
