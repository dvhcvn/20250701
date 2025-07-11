Write ./031_build_old_array.ts to download data from https://github.com/daohoangson/dvhcvn/raw/refs/tags/v20250301/data/sorted.json.

The JSON looks like this:

```jsonc
[
  [
    "89",
    "An Giang",
    "Tỉnh",
    "An Giang",
    [
      [
        "886",
        "An Phú",
        "Huyện",
        "An Phu",
        [
          ["30337", "An Phú", "Thị trấn", "An Phu"]
          // other wards
        ]
      ]
      // other districts
    ]
  ]
  // other provinces
]
```

The script should go through each provices, each districts and each wards.
Write ./tmp/old.json file with an array of `Unit` objects.

```typescript
interface Ward {
  ward_code: string; // 30337
  ward_name: string; // Thị trấn An Phú
  district_code: string; // 886
  district_name: string; // Huyện An Phú
  province_code: string; // 89
  province_name: string; // Tỉnh An Giang
}

interface District {
  district_code: string; // 886
  district_name: string; // Huyện An Phú
  province_code: string; // 89
  province_name: string; // Tỉnh An Giang
}

interface Province {
  province_code: string; // 89
  province_name: string; // Tỉnh An Giang
}

type Unit = Ward | District | Province;
```

Rules:

- Include all provinces
- Include all wards
- Only include districts that don't have any wards
