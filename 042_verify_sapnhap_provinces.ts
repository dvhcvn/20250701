import * as fs from "fs";
import * as path from "path";
import { normalize } from "./034_workers";
import type { Level1, MappingData, Merge } from "./037_generate_mapping";

interface SapnhapProvince {
  id: number;
  tentinh: string;
  truocsapnhap: string;
  con: string;
}

interface VerificationResult {
  province_id: string;
  province_name: string;
  sapnhap_truocsapnhap: string;
  mapping_merges: string[];
  status: "match" | "mismatch" | "no_merges" | "not_found";
  details?: string;
}

function extractProvinceNamesFromTruocsapnhap(
  truocsapnhap: string,
  provinceName: string
): string[] {
  if (truocsapnhap === "không sáp nhập") {
    // For provinces that didn't merge, expect the province itself
    return [normalize(provinceName)];
  }

  // Split by common separators and extract province names
  const parts = truocsapnhap
    .split(/\s+và\s+|\s*,\s*/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return parts.map(normalize);
}

function extractProvinceNamesFromMerges(merges: Merge[]): string[] {
  return merges
    .map((merge) => normalize(merge.name))
    .filter((name, index, arr) => arr.indexOf(name) === index); // Remove duplicates
}

function verifyProvinces(): VerificationResult[] {
  // Read data files
  const sapnhapData: SapnhapProvince[] = JSON.parse(
    fs.readFileSync("./tmp/sapnhap_provinces.json", "utf8")
  );

  const mappingData: MappingData = JSON.parse(
    fs.readFileSync("./data/mapping.json", "utf8")
  );

  console.log(
    `Loaded ${sapnhapData.length} sapnhap provinces and ${mappingData.data.length} mapping provinces`
  );

  // Create mapping lookup by normalized name
  const mappingByName = new Map<string, Level1>();
  for (const province of mappingData.data) {
    const normalizedName = normalize(province.name);
    mappingByName.set(normalizedName, province);
  }

  const results: VerificationResult[] = [];

  for (const sapnhapProvince of sapnhapData) {
    const normalizedSapnhapName = normalize(sapnhapProvince.tentinh);
    const mappingProvince = mappingByName.get(normalizedSapnhapName);

    if (!mappingProvince) {
      results.push({
        province_id: sapnhapProvince.id.toString(),
        province_name: sapnhapProvince.tentinh,
        sapnhap_truocsapnhap: sapnhapProvince.truocsapnhap,
        mapping_merges: [],
        status: "not_found",
        details: `Province not found in mapping data`,
      });
      continue;
    }

    if (mappingProvince.merges.length === 0) {
      results.push({
        province_id: sapnhapProvince.id.toString(),
        province_name: sapnhapProvince.tentinh,
        sapnhap_truocsapnhap: sapnhapProvince.truocsapnhap,
        mapping_merges: [],
        status: "no_merges",
        details: `No merges found in mapping data`,
      });
      continue;
    }

    // Extract province names from both sources
    const sapnhapProvinces = extractProvinceNamesFromTruocsapnhap(
      sapnhapProvince.truocsapnhap,
      sapnhapProvince.tentinh
    );
    const mappingProvinces = extractProvinceNamesFromMerges(
      mappingProvince.merges
    );

    // Compare the sets
    const sapnhapSet = new Set(sapnhapProvinces);
    const mappingSet = new Set(mappingProvinces);

    let status: "match" | "mismatch" = "match";
    let details = "";

    // Check if sets are equivalent
    if (
      sapnhapSet.size !== mappingSet.size ||
      ![...sapnhapSet].every((name) => mappingSet.has(name))
    ) {
      status = "mismatch";

      const onlyInSapnhap = [...sapnhapSet].filter(
        (name) => !mappingSet.has(name)
      );
      const onlyInMapping = [...mappingSet].filter(
        (name) => !sapnhapSet.has(name)
      );

      if (onlyInSapnhap.length > 0) {
        details += `Only in sapnhap: ${onlyInSapnhap.join(", ")}. `;
      }
      if (onlyInMapping.length > 0) {
        details += `Only in mapping: ${onlyInMapping.join(", ")}.`;
      }
    }

    results.push({
      province_id: sapnhapProvince.id.toString(),
      province_name: sapnhapProvince.tentinh,
      sapnhap_truocsapnhap: sapnhapProvince.truocsapnhap,
      mapping_merges: mappingProvinces,
      status,
      details: details.trim(),
    });
  }

  return results;
}

async function main() {
  try {
    console.log("Verifying sapnhap provinces data...");

    const results = verifyProvinces();

    // Generate summary
    const summary = {
      total: results.length,
      matches: results.filter((r) => r.status === "match").length,
      mismatches: results.filter((r) => r.status === "mismatch").length,
      no_merges: results.filter((r) => r.status === "no_merges").length,
      not_found: results.filter((r) => r.status === "not_found").length,
    };

    console.log("\n=== VERIFICATION SUMMARY ===");
    console.log(`Total provinces: ${summary.total}`);
    console.log(`Matches: ${summary.matches}`);
    console.log(`Mismatches: ${summary.mismatches}`);
    console.log(`No merges: ${summary.no_merges}`);
    console.log(`Not found: ${summary.not_found}`);

    // Show detailed results for non-matches
    const issues = results.filter((r) => r.status !== "match");
    if (issues.length > 0) {
      console.log("\n=== ISSUES FOUND ===");
      for (const issue of issues) {
        console.log(`\n${issue.province_name} (ID: ${issue.province_id})`);
        console.log(`  Status: ${issue.status}`);
        console.log(`  Sapnhap truocsapnhap: ${issue.sapnhap_truocsapnhap}`);
        console.log(`  Mapping merges: [${issue.mapping_merges.join(", ")}]`);
        if (issue.details) {
          console.log(`  Details: ${issue.details}`);
        }
      }
    }

    // Write detailed results to file
    const outputPath = path.join(
      process.cwd(),
      "tmp",
      "sapnhap_verification.json"
    );
    fs.writeFileSync(outputPath, JSON.stringify({ summary, results }, null, 2));
    console.log(`\nDetailed results written to ${outputPath}`);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
