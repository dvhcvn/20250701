import * as fs from "fs";
import * as path from "path";
import { normalize } from "./034_workers";
import type { Level2, MappingData, Merge } from "./037_generate_mapping";
import type { Ward as SapnhapWard } from "./041_download_sapnhap";

interface VerificationResult {
  ward_id: string;
  ward_name: string;
  ward_type: string;
  province_name: string;
  sapnhap_truocsapnhap: string;
  mapping_merges: string[];
  status: "match" | "mismatch" | "no_merges";
  details?: string;
}

function extractWardNamesFromTruocsapnhap(
  truocsapnhap: string,
  wardName: string
): string[] {
  if (normalize(truocsapnhap) === "khongxapnhap") {
    // For wards that didn't merge, expect the ward itself
    return [normalize(`xã ${wardName}`)];
  }

  // First, remove all parenthetical expressions from the entire string
  // This handles the case where parentheses span across comma-separated parts
  let cleaned = truocsapnhap;
  let prevLength;
  do {
    prevLength = cleaned.length;
    cleaned = cleaned.replace(/\s*\([^)]*\)/g, "");
  } while (cleaned.length !== prevLength);

  // Now split by commas and normalize each part
  return cleaned.split(/\s*,\s*/).map(normalize);
}

function extractWardNamesFromMerges(merges: Merge[]): string[] {
  return merges
    .map((merge) => normalize(merge.name))
    .filter((name, index, arr) => arr.indexOf(name) === index); // Remove duplicates
}

function verifyWard(
  sapnhapWard: SapnhapWard,
  mappingWards: Level2[]
): VerificationResult {
  const results: VerificationResult[] = [];

  for (const mappingWard of mappingWards) {
    if (mappingWard.merges.length === 0) {
      results.push({
        ward_id: sapnhapWard.id.toString(),
        ward_name: sapnhapWard.tenhc,
        ward_type: sapnhapWard.loai,
        province_name: sapnhapWard.tentinh,
        sapnhap_truocsapnhap: sapnhapWard.truocsapnhap,
        mapping_merges: [],
        status: "no_merges",
        details: `No merges found in mapping data`,
      });
      continue;
    }

    // Extract ward names from both sources
    const sapnhapWards = extractWardNamesFromTruocsapnhap(
      sapnhapWard.truocsapnhap,
      sapnhapWard.tenhc
    );
    const mappingWardNames = extractWardNamesFromMerges(mappingWard.merges);

    // Compare the sets
    const sapnhapSet = new Set(sapnhapWards);
    const mappingSet = new Set(mappingWardNames);

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
      ward_id: sapnhapWard.id.toString(),
      ward_name: sapnhapWard.tenhc,
      ward_type: sapnhapWard.loai,
      province_name: sapnhapWard.tentinh,
      sapnhap_truocsapnhap: sapnhapWard.truocsapnhap,
      mapping_merges: mappingWardNames,
      status,
      details: details.trim(),
    });

    if (status === "match") {
      // If we found a match, we can stop checking further merges
      return results[results.length - 1];
    }
  }

  return results[0];
}

function verifyWards(): VerificationResult[] {
  // Read data files
  const sapnhapData: SapnhapWard[] = JSON.parse(
    fs.readFileSync("./tmp/sapnhap_wards.json", "utf8")
  );

  const mappingData: MappingData = JSON.parse(
    fs.readFileSync("./data/mapping.json", "utf8")
  );

  console.log(
    `Loaded ${sapnhapData.length} sapnhap wards and ${mappingData.data.length} mapping provinces`
  );

  // Create mapping lookup by province + ward name for better matching
  const wardsByProvinceAndName = new Map<string, Level2[]>();
  for (const province of mappingData.data) {
    const normalizedProvinceName = normalize(province.name);

    for (const ward of province.level2s) {
      const normalizedWardName = normalize(ward.name);
      const provinceWardKey = `${normalizedProvinceName}:${normalizedWardName}`;
      const wardsByProvinceWardKey =
        wardsByProvinceAndName.get(provinceWardKey);
      if (typeof wardsByProvinceWardKey !== "undefined") {
        wardsByProvinceWardKey.push(ward);
      } else {
        wardsByProvinceAndName.set(provinceWardKey, [ward]);
      }
    }
  }

  const results: VerificationResult[] = [];
  for (const sapnhapWard of sapnhapData) {
    const normalizedSapnhapName = normalize(`xã ${sapnhapWard.tenhc}`);
    const normalizedSapnhapProvinceName = normalize(sapnhapWard.tentinh);

    // try to find ward by province + ward name combination
    const provinceWardKey = `${normalizedSapnhapProvinceName}:${normalizedSapnhapName}`;
    const mappingWards = wardsByProvinceAndName.get(provinceWardKey);
    if (typeof mappingWards === "undefined") {
      throw new Error(
        `No mapping found for province ${sapnhapWard.tentinh} and ward ${sapnhapWard.tenhc}`
      );
    }

    results.push(verifyWard(sapnhapWard, mappingWards));
  }

  return results;
}

async function main() {
  try {
    console.log("Verifying sapnhap wards data...");

    const results = verifyWards();

    // Generate summary
    const summary = {
      total: results.length,
      matches: results.filter((r) => r.status === "match").length,
      mismatches: results.filter((r) => r.status === "mismatch").length,
      no_merges: results.filter((r) => r.status === "no_merges").length,
    };

    console.log("\n=== VERIFICATION SUMMARY ===");
    console.log(`Total wards: ${summary.total}`);
    console.log(`Matches: ${summary.matches}`);
    console.log(`Mismatches: ${summary.mismatches}`);
    console.log(`No merges: ${summary.no_merges}`);

    // Show detailed results for non-matches (limit to first 10 for readability)
    const issues = results.filter((r) => r.status !== "match");
    if (issues.length > 0) {
      console.log("\n=== ISSUES FOUND (first 10) ===");
      for (const issue of issues.slice(0, 10)) {
        console.log(
          `\n${issue.ward_name} (ID: ${issue.ward_id}, Type: ${issue.ward_type})`
        );
        console.log(`  Province: ${issue.province_name}`);
        console.log(`  Status: ${issue.status}`);
        console.log(`  Sapnhap truocsapnhap: ${issue.sapnhap_truocsapnhap}`);
        console.log(`  Mapping merges: [${issue.mapping_merges.join(", ")}]`);
        if (issue.details) {
          console.log(`  Details: ${issue.details}`);
        }
      }

      if (issues.length > 10) {
        console.log(`\n... and ${issues.length - 10} more issues`);
      }
    }

    // Write detailed results to file
    const outputPath = path.join(
      process.cwd(),
      "tmp",
      "sapnhap_wards_verification.json"
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
