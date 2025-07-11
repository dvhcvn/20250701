import * as fs from "fs";
import * as path from "path";
import type { Unit as NewUnit } from "./032_build_new_array";
import type { Unit as OldUnit } from "./031_build_old_array";
import type { Output } from "./036_analyze_output";

export interface Merge {
  old_id: string;
  name: string;
  type: "full" | "partial";
}

export interface MergeLevel2 {
  level2_id: string;
  name: string;
  merges: Merge[];
}

export interface MergeLevel1 {
  level1_id: string;
  name: string;
  merges: Merge[];
  level2s: MergeLevel2[];
}

export interface MergesData {
  data: MergeLevel1[];
  stats: {
    level1_count: number;
    level2_count: number;
  };
}

export interface Split {
  new_id: string;
  name: string;
}

export interface SplitLevel3 {
  level3_id: string;
  name: string;
  splits: Split[];
}

export interface SplitLevel2 {
  level2_id: string;
  name: string;
  splits: Split[];
}

export interface SplitLevel1 {
  level1_id: string;
  name: string;
  splits: Split[];
  level2s?: SplitLevel2[];
  level3s?: SplitLevel3[];
}

export interface SplitsData {
  data: SplitLevel1[];
  stats: {
    level1_count: number;
    level2_count: number;
    level3_count: number;
  };
}

function findJsonFiles(dir: string): string[] {
  const files: string[] = [];

  function traverse(currentDir: string, depth = 0) {
    try {
      const items = fs.readdirSync(currentDir);

      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory() && depth < 3) {
          traverse(fullPath, depth + 1);
        } else if (stat.isFile() && item.endsWith(".json")) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not read directory ${currentDir}:`, error);
    }
  }

  traverse(dir);
  return files;
}

function buildMappingStructure(): [MergesData, SplitsData] {
  // Read data files
  const oldData: OldUnit[] = JSON.parse(
    fs.readFileSync("./tmp/old.json", "utf8")
  );
  const newData: NewUnit[] = JSON.parse(
    fs.readFileSync("./tmp/new.json", "utf8")
  );

  console.log(
    `Loaded ${oldData.length} old units and ${newData.length} new units`
  );

  const mergeProvincesMap = new Map<string, MergeLevel1>();
  const mergeWardsMap = new Map<string, MergeLevel2>();
  const splitProvincesMap = new Map<string, SplitLevel1>();
  const splitDistrictsMap = new Map<string, SplitLevel2>();
  const splitWardsMap = new Map<string, SplitLevel3>();

  // Create maps for quick lookup
  const oldUnitsMap = new Map<string, OldUnit>();
  for (const unit of oldData) {
    if (unit.ward_code) {
      oldUnitsMap.set(unit.ward_code, unit);
      const ward: SplitLevel3 = {
        level3_id: unit.ward_code,
        name: unit.ward_name!,
        splits: [],
      };
      splitWardsMap.set(unit.ward_code, ward);

      // update province too
      const province = splitProvincesMap.get(unit.province_code)!;
      province.level3s ??= [];
      province.level3s.push(ward);
    } else if (unit.district_code) {
      oldUnitsMap.set(unit.district_code, unit);
      const district: SplitLevel2 = {
        level2_id: unit.district_code,
        name: unit.district_name!,
        splits: [],
      };
      splitDistrictsMap.set(unit.district_code, district);

      // update province too
      const province = splitProvincesMap.get(unit.province_code)!;
      province.level2s ??= [];
      province.level2s.push(district);
    } else {
      oldUnitsMap.set(unit.province_code, unit);
      splitProvincesMap.set(unit.province_code, {
        level1_id: unit.province_code,
        name: unit.province_name!,
        splits: [],
      });
    }
  }

  // First pass: create provinces and wards
  for (const unit of newData) {
    if (unit.ward_code) {
      // This is a ward
      const ward: MergeLevel2 = {
        level2_id: unit.ward_code,
        name: unit.ward_name!,
        merges: [],
      };
      mergeWardsMap.set(unit.ward_code, ward);
      mergeProvincesMap.get(unit.province_code)!.level2s.push(ward);
    } else {
      // This is a province
      if (!mergeProvincesMap.has(unit.province_code)) {
        mergeProvincesMap.set(unit.province_code, {
          level1_id: unit.province_code,
          name: unit.province_name,
          merges: [],
          level2s: [],
        });
      }
    }
  }

  // Process output files to build merge information
  const outputDir = "./output";
  const jsonFiles = findJsonFiles(outputDir);

  console.log(`Processing ${jsonFiles.length} output files...`);

  for (const filePath of jsonFiles) {
    // Extract old unit code from file path
    const pathParts = filePath.split(path.sep);
    const fileName = pathParts[pathParts.length - 1];
    const oldUnitCode = fileName.replace(".json", "");

    // Find corresponding old unit
    const oldUnit = oldUnitsMap.get(oldUnitCode);
    if (!oldUnit) {
      throw new Error(`Old unit not found for code: ${oldUnitCode}`);
    }

    // Read output file
    const content = fs.readFileSync(filePath, "utf8");
    const outputData: Output = JSON.parse(content);

    // Process results
    for (const result of outputData.result) {
      const merge: Merge = {
        old_id:
          oldUnit.ward_code ?? oldUnit.district_code ?? oldUnit.province_code,
        name:
          oldUnit.ward_name ?? oldUnit.district_name ?? oldUnit.province_name,
        type: outputData.result.length === 1 ? "full" : "partial",
      };
      let split: Split;
      if ("ward_code" in result) {
        mergeWardsMap.get(result.ward_code)!.merges.push(merge);
        split = { new_id: result.ward_code, name: result.ward_name };
      } else {
        mergeProvincesMap.get(result.province_code)!.merges.push(merge);
        split = { new_id: result.province_code, name: result.province_name };
      }

      if (oldUnit.ward_code) {
        splitWardsMap.get(oldUnit.ward_code)!.splits.push(split);
      } else if (oldUnit.district_code) {
        splitDistrictsMap.get(oldUnit.district_code)!.splits.push(split);
      } else {
        splitProvincesMap.get(oldUnit.province_code)!.splits.push(split);
      }
    }
  }

  // Build merges array
  const mergeLevel1s: MergeLevel1[] = Array.from(mergeProvincesMap.values());
  mergeLevel1s.sort((a, b) => a.level1_id.localeCompare(b.level1_id));
  for (const province of mergeLevel1s) {
    province.level2s.sort((a, b) => a.level2_id.localeCompare(b.level2_id));
  }
  const ml2c = mergeLevel1s.reduce((s, p) => s + p.level2s.length, 0);

  // Build splits array
  const splitLevel1s: SplitLevel1[] = Array.from(splitProvincesMap.values());
  splitLevel1s.sort((a, b) => a.level1_id.localeCompare(b.level1_id));
  for (const province of splitLevel1s) {
    province.level2s?.sort((a, b) => a.level2_id.localeCompare(b.level2_id));
    province.level3s?.sort((a, b) => a.level3_id.localeCompare(b.level3_id));
  }
  const sl2c = splitLevel1s.reduce((s, p) => s + (p.level2s?.length ?? 0), 0);
  const sl3c = splitLevel1s.reduce((s, p) => s + (p.level3s?.length ?? 0), 0);

  return [
    {
      data: mergeLevel1s,
      stats: {
        level1_count: mergeLevel1s.length,
        level2_count: ml2c,
      },
    },
    {
      data: splitLevel1s,
      stats: {
        level1_count: splitLevel1s.length,
        level2_count: sl2c,
        level3_count: sl3c,
      },
    },
  ];
}

async function main() {
  try {
    console.log("Generating mapping...");

    const [merges, splits] = buildMappingStructure();

    // Ensure mapping directory exists
    const mappingDir = path.join(process.cwd(), "mapping");
    if (!fs.existsSync(mappingDir)) {
      fs.mkdirSync(mappingDir, { recursive: true });
    }

    // Write output
    const mergesPath = path.join(mappingDir, "merges.json");
    fs.writeFileSync(mergesPath, JSON.stringify(merges, null, 2));
    const splitsPath = path.join(mappingDir, "splits.json");
    fs.writeFileSync(splitsPath, JSON.stringify(splits, null, 2));

    console.log(`Successfully generated mapping`);
    console.log(`Merges stats:`);
    console.log(`- Level 1 (Provinces): ${merges.stats.level1_count}`);
    console.log(`- Level 2 (Wards): ${merges.stats.level2_count}`);
    console.log(`Splits stats:`);
    console.log(`- Level 1 (Provinces): ${splits.stats.level1_count}`);
    console.log(`- Level 2 (Districts): ${splits.stats.level2_count}`);
    console.log(`- Level 3 (Wards): ${splits.stats.level3_count}`);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
