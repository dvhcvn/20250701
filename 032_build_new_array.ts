import * as fs from "fs";
import * as path from "path";

interface Ward {
  ward_code: string; // 30337
  ward_name: string; // Thị trấn An Phú
  province_code: string; // 89
  province_name: string; // Tỉnh An Giang
}

interface Province {
  ward_code?: never;
  ward_name?: never;
  province_code: string; // 89
  province_name: string; // Tỉnh An Giang
}

export type Unit = Ward | Province;

function parseCSV(csvContent: string): Province[] {
  const lines = csvContent.trim().split("\n");
  const provinces: Province[] = [];

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(",");
    if (parts.length >= 3) {
      const province_code = parts[1].trim();
      const province_name = parts[2].trim();

      provinces.push({
        province_code,
        province_name,
      });
    }
  }

  return provinces;
}

function parseMarkdownTable(mdContent: string): Ward[] {
  const wards: Ward[] = [];
  const lines = mdContent.split("\n");

  let currentProvince = "";
  let inTable = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Check for province headers (all caps lines)
    if (
      trimmedLine.match(
        /^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]+$/
      )
    ) {
      currentProvince = trimmedLine;
      continue;
    }

    // Check if we're in a table (starts with |)
    if (trimmedLine.startsWith("|") && trimmedLine.includes("|")) {
      inTable = true;

      // Skip header rows
      if (trimmedLine.includes("Stt") || trimmedLine.includes("---")) {
        continue;
      }

      const cells = trimmedLine
        .split("|")
        .map((cell) => cell.trim())
        .filter((cell) => cell);

      // Expected format: | Stt | Mã số | Tên đơn vị hành chính | Tỉnh (thành phố) |
      if (cells.length >= 4 && cells[1].match(/^\d{5}$/)) {
        const ward_code = cells[1];
        const ward_name = cells[2].replace(/<br>/g, " ").trim();
        const province_name = (cells[3] || currentProvince)
          .replace(/<br>/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        wards.push({
          ward_code,
          ward_name,
          province_code: "", // Will need to be mapped from province name
          province_name,
        });
      }
    } else if (inTable && !trimmedLine.startsWith("|")) {
      inTable = false;
    }
  }

  return wards;
}

function mapProvinceNames(wards: Ward[], provinces: Province[]): Ward[] {
  // Create a mapping from province names to IDs
  const provinceMap = new Map<string, string>();

  for (const province of provinces) {
    provinceMap.set(province.province_name, province.province_code);
  }

  // Helper function to normalize province names for matching
  function normalizeProvinceName(name: string): string {
    return name
      .replace(/<br>/g, " ") // Remove <br> tags
      .replace(/\s+/g, " ") // Normalize whitespace
      .replace(/^(Tỉnh|Thành phố|Tp)\s+/, "") // Remove prefixes including abbreviations
      .trim();
  }

  // Create additional mappings with normalized names
  const normalizedMap = new Map<string, string>();
  for (const province of provinces) {
    const normalized = normalizeProvinceName(province.province_name);
    normalizedMap.set(normalized, province.province_code);
  }

  // Update wards with province IDs
  return wards.map((ward) => {
    let province_code = provinceMap.get(ward.province_name);

    // If direct match fails, try normalized matching
    if (!province_code) {
      const normalizedWardProvince = normalizeProvinceName(ward.province_name);
      province_code = normalizedMap.get(normalizedWardProvince) || "";
    }

    return {
      ...ward,
      province_code,
    };
  });
}

async function main() {
  try {
    console.log("Starting new data processing...");

    // Read CSV file for provinces
    const csvPath = path.join(
      process.cwd(),
      "input",
      "docs",
      "915_CTK-CSCL.csv"
    );
    const csvContent = fs.readFileSync(csvPath, "utf8");
    const provinces = parseCSV(csvContent);
    console.log(`Parsed ${provinces.length} provinces from CSV`);

    // Read markdown file for wards
    const mdPath = path.join(
      process.cwd(),
      "input",
      "docs",
      "1027_CTK-CSCL.md"
    );
    const mdContent = fs.readFileSync(mdPath, "utf8");
    let wards = parseMarkdownTable(mdContent);
    console.log(`Parsed ${wards.length} wards from markdown`);

    // Map province names to IDs
    wards = mapProvinceNames(wards, provinces);

    // Combine all units
    const units: Unit[] = [
      ...provinces.map((p) => {
        let province_name = p.province_name;
        if (!province_name.startsWith("Thành phố ")) {
          province_name = `Tỉnh ${province_name}`;
        }
        return { ...p, province_name };
      }),
      ...wards,
    ];

    // Ensure tmp directory exists
    const tmpDir = path.join(process.cwd(), "tmp");
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Write output
    const outputPath = path.join(tmpDir, "new.json");
    fs.writeFileSync(outputPath, JSON.stringify(units, null, 2));

    console.log(`Successfully wrote ${units.length} units to ${outputPath}`);

    // Log summary
    console.log(`Summary:`);
    console.log(`- Provinces: ${provinces.length}`);
    console.log(`- Wards: ${wards.length}`);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
