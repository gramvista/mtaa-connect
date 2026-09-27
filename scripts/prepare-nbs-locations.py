"""Extract official NBS 2022 DBF attributes and generate a reviewable data migration.

Python standard library only. Input must match the pinned official ZIP checksum.
No downloads, database writes, geometry conversion or inferred administrative names.
Usage: python scripts/prepare-nbs-locations.py path/to/nbs-2022-wards.zip
"""
import collections
import hashlib
import json
from pathlib import Path
import struct
import sys
import zipfile

ROOT = Path(__file__).resolve().parent.parent
DATASET = 'nbs-2022-wards-2024'
SHA256 = 'a81eecf5021d1904d2d57a3c5ea40b8c3f538cd5b227e8d68a302653a6d1466e'
URL = 'https://www.nbs.go.tz/uploads/statistics/documents/en-1714652282-TANZANIA_2022PHC_WARD_SHAPEFILES.zip'
FIELDS = ['OBJECTID_1', 'reg_code', 'reg_name', 'dist_code', 'dist_name', 'counc_code', 'counc_name', 'ward_code', 'ward_name']


def extract(archive):
    raw = Path(archive).read_bytes()
    if hashlib.sha256(raw).hexdigest() != SHA256:
        raise ValueError('Source checksum changed. Review the new release before importing.')
    with zipfile.ZipFile(archive) as source:
        if source.read('TANZANIA_2022PHC_WARDS_SHAPEFILES.cpg').strip() != b'UTF-8':
            raise ValueError('Unexpected source encoding')
        dbf = source.read('TANZANIA_2022PHC_WARDS_SHAPEFILES.dbf')
    count = struct.unpack_from('<I', dbf, 4)[0]
    header_size, record_size = struct.unpack_from('<HH', dbf, 8)
    columns = []
    for offset in range(32, header_size - 1, 32):
        if dbf[offset] == 13:
            break
        columns.append((dbf[offset:offset+11].split(b'\x00')[0].decode('ascii'), dbf[offset+16]))
    rows = []
    for index in range(count):
        record = dbf[header_size + index*record_size:header_size + (index+1)*record_size]
        if len(record) != record_size or record[0] != 32:
            raise ValueError('Unexpected truncated/deleted source record')
        row, offset = {}, 1
        for name, size in columns:
            if name in FIELDS:
                row[name] = record[offset:offset+size].decode('utf-8').strip()
            offset += size
        if set(row) != set(FIELDS) or any(not value for value in row.values()):
            raise ValueError('Missing administrative field')
        rows.append(row)
    return rows


def prepare(rows):
    regions, districts, councils = {}, {}, {}
    names, codes = collections.defaultdict(list), collections.defaultdict(list)
    for row in rows:
        for mapping, key, value in [
            (regions, row['reg_code'], row['reg_name']),
            (districts, (row['reg_code'], row['dist_code']), row['dist_name']),
            (councils, (row['reg_code'], row['dist_code'], row['counc_code']), row['counc_name']),
        ]:
            if key in mapping and mapping[key] != value:
                raise ValueError('Inconsistent parent name')
            mapping[key] = value
        names[(row['reg_code'], row['dist_code'], row['ward_name'])].append(row)
        codes[(row['reg_code'], row['dist_code'], row['counc_code'], row['ward_code'])].append(row)
    if (len(regions), len(districts), len(councils), len(rows)) != (31, 150, 195, 4344):
        raise ValueError('Unexpected coverage counts')
    if len({row['OBJECTID_1'] for row in rows}) != len(rows):
        raise ValueError('Duplicate source feature identifiers')
    for row in rows:
        key = (row['reg_code'], row['dist_code'], row['ward_name'])
        row['display_name'] = row['ward_name'] if len(names[key]) == 1 else f"{row['ward_name']} ({row['counc_name']})"
        if not 2 <= len(row['display_name']) <= 100:
            raise ValueError('Display name outside database bounds')
    if len({(r['reg_code'], r['dist_code'], r['display_name']) for r in rows}) != len(rows):
        raise ValueError('Unresolved duplicate display names')
    rows.sort(key=lambda r: (r['reg_code'], r['dist_code'], r['counc_code'], r['ward_name'], r['OBJECTID_1']))
    report = {
        'dataset': DATASET, 'publisher': 'National Bureau of Statistics, Tanzania',
        'source_url': URL, 'source_sha256': SHA256, 'reference_year': 2022,
        'counts': {'regions': 31, 'districts': 150, 'councils': 195, 'wards_shehia': 4344},
        'duplicate_names': [v for v in names.values() if len(v) > 1],
        'reused_ward_codes': [v for v in codes.values() if len(v) > 1],
        'regions': [{'code': code, 'name': name,
                     'districts': sum(1 for rc, dc in districts if rc == code),
                     'wards_shehia': sum(1 for r in rows if r['reg_code'] == code)}
                    for code, name in sorted(regions.items())],
    }
    return rows, report


def migration(rows):
    payload = json.dumps(rows, ensure_ascii=False, separators=(',', ':'))
    if '$nbs2022$' in payload:
        raise ValueError('Unexpected SQL delimiter in source')
    template = (ROOT / 'scripts/templates/nbs-locations.sql').read_text(encoding='utf-8')
    return template.replace('__DATASET_ROWS__', payload)


def main():
    rows, report = prepare(extract(sys.argv[1]))
    output = ROOT / 'data/locations'
    output.mkdir(parents=True, exist_ok=True)
    (output / 'nbs-2022-wards.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (output / 'nbs-2022-provenance.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (ROOT / 'supabase/migrations/202609250007_nbs_2022_locations.sql').write_text(migration(rows), encoding='utf-8')
    print('Prepared 31 regions, 150 districts, 4344 wards/shehia; 3 duplicate-name groups and 5 reused-code groups retained.')


if __name__ == '__main__':
    main()
