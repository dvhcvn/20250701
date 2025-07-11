import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";

interface Ward {
  ward_code: string; // 30337
  ward_name: string; // Thị trấn An Phú
  district_code: string; // 886
  district_name: string; // Huyện An Phú
  province_code: string; // 89
  province_name: string; // Tỉnh An Giang
}

interface District {
  ward_code?: never;
  ward_name?: never;
  district_code: string; // 886
  district_name: string; // Huyện An Phú
  province_code: string; // 89
  province_name: string; // Tỉnh An Giang
}

interface Province {
  ward_code?: never;
  ward_name?: never;
  district_code?: never;
  district_name?: never;
  province_code: string; // 89
  province_name: string; // Tỉnh An Giang
}

export type Unit = Ward | District | Province;

// Type definitions for the raw JSON structure
type RawWard = [string, string, string, string];
type RawDistrict = [string, string, string, string, RawWard[]?];
type RawProvince = [string, string, string, string, RawDistrict[]?];

async function downloadData(): Promise<RawProvince[]> {
  const url =
    "https://github.com/daohoangson/dvhcvn/raw/refs/tags/v20250301/data/sorted.json";

  console.log("Downloading data from:", url);

  return new Promise((resolve, reject) => {
    const makeRequest = (requestUrl: string, redirectCount = 0) => {
      if (redirectCount > 5) {
        reject(new Error("Too many redirects"));
        return;
      }

      const urlObj = new URL(requestUrl);
      const client = urlObj.protocol === "https:" ? https : http;

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Node.js)",
        },
      };

      const req = client.request(options, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          if (response.headers.location) {
            console.log(`Redirecting to: ${response.headers.location}`);
            makeRequest(response.headers.location, redirectCount + 1);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(
            new Error(
              `Failed to download data: ${response.statusCode} ${response.statusMessage}`
            )
          );
          return;
        }

        let data = "";
        response.setEncoding("utf8");

        response.on("data", (chunk) => {
          data += chunk;
        });

        response.on("end", () => {
          try {
            const jsonData = JSON.parse(data);
            resolve(jsonData);
          } catch (error) {
            reject(new Error(`Failed to parse JSON: ${error}`));
          }
        });
      });

      req.on("error", (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });

      req.end();
    };

    makeRequest(url);
  });
}

function processData(rawData: RawProvince[]): Unit[] {
  const units: Unit[] = [];

  for (const rawProvince of rawData) {
    const [province_code, provinceName, provinceType, , districts] =
      rawProvince;
    const province_name = `${provinceType} ${provinceName}`;

    // Always include provinces
    const province: Province = {
      province_code,
      province_name,
    };
    units.push(province);

    if (districts) {
      for (const rawDistrict of districts) {
        const [district_code, districtName, districtType, , wards] =
          rawDistrict;
        const district_name = `${districtType} ${districtName}`;

        const hasWards = wards && wards.length > 0;

        // Only include districts that don't have any wards
        if (!hasWards) {
          const district: District = {
            district_code,
            district_name,
            province_code,
            province_name,
          };
          units.push(district);
        }

        // Always include all wards
        if (wards) {
          for (const rawWard of wards) {
            const [ward_code, wardName, wardType] = rawWard;
            const ward_name = `${wardType} ${wardName}`;

            const ward: Ward = {
              ward_code,
              ward_name,
              district_code,
              district_name,
              province_code,
              province_name,
            };
            units.push(ward);
          }
        }
      }
    }
  }

  return units;
}

async function main() {
  try {
    console.log("Starting data processing...");

    // Download data
    const rawData = await downloadData();
    console.log(`Downloaded data for ${rawData.length} provinces`);

    // Process data
    const units = processData(rawData);
    console.log(`Processed ${units.length} units`);

    // Ensure tmp directory exists
    const tmpDir = path.join(process.cwd(), "tmp");
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Write output
    const outputPath = path.join(tmpDir, "old.json");
    fs.writeFileSync(outputPath, JSON.stringify(units, null, 2));

    console.log(`Successfully wrote ${units.length} units to ${outputPath}`);
    // Log summary
    const provinces = units.filter(
      (u) => "province_code" in u && !("district_code" in u)
    );
    const districts = units.filter(
      (u) => "district_code" in u && !("ward_code" in u)
    );
    const wards = units.filter((u) => "ward_code" in u);

    console.log(`Summary:`);
    console.log(`- Provinces: ${provinces.length}`);
    console.log(`- Districts (without wards): ${districts.length}`);
    console.log(`- Wards: ${wards.length}`);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
