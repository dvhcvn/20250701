Write ./032_build_new_array.ts to read data from ./input/docs/915_CTK-CSCL.csv and ./input/docs/1027_CTK-CSCL.md files.

The script should go through each input files.
Write ./tmp/new.json file with an array of `Province` and `Ward` objects.

Rules:

- 915 contains the list of new provinces
- 1027 contains the list of new wards

---

New requirements:

- `Ward` objects should have a `province_code` property that references the `Province` it belongs to.

---

New requirements:

Use these interfaces:

```typescript
interface Ward {
  ward_code: string; // 30337
  ward_name: string; // Thị trấn An Phú
  province_code: string; // 89
  province_name: string; // Tỉnh An Giang
}

interface Province {
  province_code: string; // 89
  province_name: string; // Tỉnh An Giang
}

type Unit = Ward | Province;
```
