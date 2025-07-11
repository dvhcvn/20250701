Write `./041_download_sapnhap.ts` to download data from the sapnhap.bando.com.vn website.

Step 1, download provinces

```bash
curl 'https://sapnhap.bando.com.vn/pcotinh' \
  -H 'Content-Type: application/x-www-form-urlencoded; charset=UTF-8' \
  --data 'id=0'
```

Use valibot to validate the response. An array of these:

```json
{
  "id": 34,
  "tentinh": "tỉnh Cà Mau",
  "truocsapnhap": "tỉnh Bạc Liêu và tỉnh Cà Mau",
  "con": "64 ĐVHC (09 phường, 55 xã)"
}
```

Step 2, loop through each province and download wards:

```bash
curl 'https://sapnhap.bando.com.vn/ptracuu' \
  -H 'Content-Type: application/x-www-form-urlencoded; charset=UTF-8' \
  -H 'X-Cookie: PHPSESSID=mo5foc5qqca0gcrksdte6u0616' \
  --data 'id=34'
```

Use valibot to validate the response. An array of these:

```json
{
  "id": 3355,
  "matinh": 34,
  "loai": "phường",
  "tenhc": "Vĩnh Trạch",
  "truocsapnhap": "Phường 5 (thành phố Bạc Liêu), Xã Vĩnh Trạch"
}
```

Write all provinces to `./tmp/sapnhap_provinces.json` and all wards to `./tmp/sapnhap_wards.json`.
