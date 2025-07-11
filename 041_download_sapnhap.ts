import * as fs from "fs";
import * as path from "path";
import * as v from "valibot";

// Valibot schemas for validation
const ProvinceSchema = v.object({
  id: v.number(),
  tentinh: v.string(),
  truocsapnhap: v.string(),
  con: v.string(),
});

const WardSchema = v.object({
  id: v.number(),
  tentinh: v.string(),
  loai: v.string(),
  tenhc: v.string(),
  truocsapnhap: v.string(),
});

const ProvincesArraySchema = v.array(ProvinceSchema);
const WardsArraySchema = v.array(WardSchema);

export type Province = v.InferOutput<typeof ProvinceSchema>;
export type Ward = v.InferOutput<typeof WardSchema>;

async function downloadProvinces(): Promise<Province[]> {
  console.log("Downloading provinces...");

  const response = await fetch("https://sapnhap.bando.com.vn/pcotinh", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: "id=0",
  });

  if (!response.ok) {
    throw new Error(
      `Failed to download provinces: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  // Validate response with valibot
  const validatedData = v.parse(ProvincesArraySchema, data);

  console.log(`Downloaded ${validatedData.length} provinces`);
  return validatedData;
}

async function downloadWardsForProvince(provinceId: number): Promise<Ward[]> {
  console.log(`Downloading wards for province ${provinceId}...`);

  const response = await fetch("https://sapnhap.bando.com.vn/ptracuu", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Cookie": "PHPSESSID=mo5foc5qqca0gcrksdte6u0616",
    },
    body: `id=${provinceId}`,
  });

  if (!response.ok) {
    throw new Error(
      `Failed to download wards for province ${provinceId}: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  // Validate response with valibot
  const validatedData = v.parse(WardsArraySchema, data);

  console.log(
    `Downloaded ${validatedData.length} wards for province ${provinceId}`
  );
  return validatedData;
}

async function downloadAllWards(provinces: Province[]): Promise<Ward[]> {
  const allWards: Ward[] = [];

  for (const province of provinces) {
    try {
      const wards = await downloadWardsForProvince(province.id);
      allWards.push(...wards);

      // Add a small delay to be respectful to the server
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(
        `Error downloading wards for province ${province.id}:`,
        error
      );
      // Continue with other provinces even if one fails
    }
  }

  return allWards;
}

async function main() {
  try {
    console.log("Starting sapnhap data download...");

    // Step 1: Download provinces
    const provinces = await downloadProvinces();

    // Step 2: Download wards for each province
    const wards = await downloadAllWards(provinces);

    // Ensure tmp directory exists
    const tmpDir = path.join(process.cwd(), "tmp");
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Write provinces to file
    const provincesPath = path.join(tmpDir, "sapnhap_provinces.json");
    fs.writeFileSync(provincesPath, JSON.stringify(provinces, null, 2));
    console.log(`Saved ${provinces.length} provinces to ${provincesPath}`);

    // Write wards to file
    const wardsPath = path.join(tmpDir, "sapnhap_wards.json");
    fs.writeFileSync(wardsPath, JSON.stringify(wards, null, 2));
    console.log(`Saved ${wards.length} wards to ${wardsPath}`);

    console.log("Download completed successfully!");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
