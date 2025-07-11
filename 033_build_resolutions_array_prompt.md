Write `./033_build_resolutions_array.ts` to read from files ending with `_NQ-UBTVQH15.md` inside `./input/docs/` directory and build an array of `Resolution` objects.

```typescript
interface Resolution {
  header: string; // e.g., "1234/NQ-UBTVQH15: Sắp xếp các đơn vị hành chính cấp xã của tỉnh ..."
  lines: string[]; // e.g., ["1. Sắp xếp ...", "2. Đổi tên ...", ...]
}
```

Write into `./tmp/resolutions.json` file.

### Rules

- Verify that there are exactly 34 resolutions in the output
- Verify that the line numbers are in sequential order starting from 1
- Verify that each line is a complete sentence
- Verify that each line starts with "Đổi tên", "Nhập", "Sắp xếp"
  - The last line must starts with "Sau khi"
  - Use `import removeAccents from "remove-accents";` to handle Vietnamese diacritics if needed
- Verify that after the last line there is a "Điều 2" in the document
- Exits with error if validation fails
