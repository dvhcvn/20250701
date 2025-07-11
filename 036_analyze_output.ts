import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import * as v from "valibot";
import type { Unit as NewUnit } from "./032_build_new_array";
import { normalize } from "./034_workers";

const WardResult = v.object({
  ward_code: v.string(),
  ward_name: v.string(),
  province_name: v.string(),
});
const ProvinceResult = v.object({
  province_code: v.string(),
  province_name: v.string(),
});

const outputSchema = v.object({
  address: v.string(),
  ellapsedInMs: v.number(),
  estimatedCost: v.number(),
  thought: v.string(),
  result: v.array(
    v.intersect([
      v.union([WardResult, ProvinceResult]),
      v.object({
        citation: v.object({
          header: v.string(),
          line: v.string(),
        }),
        confidence: v.picklist(["low", "high", "manual:low", "manual:high"]),
      }),
    ])
  ),
});

export type Output = v.InferOutput<typeof outputSchema>;

class BadCitation extends Error {
  constructor(message: string) {
    super(message);
  }
}

class LowConfidence extends Error {}

class UnrelatedCitation extends Error {
  constructor(line: string, name: string) {
    super(`Line ${line} doesn't contain ${name}`);
  }
}

class UnknownUnit extends Error {
  constructor(message: string) {
    super(message);
  }
}

function findJsonFiles(dir: string) {
  const files: string[] = [];

  function traverse(currentDir: string, depth = 0) {
    const items = readdirSync(currentDir);

    for (const item of items) {
      const fullPath = join(currentDir, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory() && depth < 3) {
        traverse(fullPath, depth + 1);
      } else if (stat.isFile() && item.endsWith(".json")) {
        files.push(fullPath);
      }
    }
  }

  traverse(dir);
  return files;
}

function analyzeFile(filePath: string): {
  data?: Output;
  error?: Error;
} {
  try {
    const content = readFileSync(filePath, "utf8");
    const data = v.parse(outputSchema, JSON.parse(content));

    if (data.result.length === 0) {
      return { data, error: new Error("Result is empty") };
    }

    const lowConfidenceEntries = data.result.filter(
      (entry) => entry.confidence === "low"
    );

    if (lowConfidenceEntries.length > 0) {
      return { data, error: new LowConfidence() };
    }

    const address = data.address;
    const [firstComponent] = address.split(",").map((s) => s.trim());
    for (const result of data.result) {
      const header = result.citation.header;
      const line = result.citation.line;
      const isManual = result.confidence.startsWith("manual:");

      const normalizedLine = normalize(line);
      if (!isManual && !normalizedLine.includes(normalize(firstComponent))) {
        // quoted line should contain the address component
        // for manual entries, we skip this check
        return { data, error: new UnrelatedCitation(line, firstComponent) };
      }

      if ("ward_code" in result) {
        if (header.startsWith("60-NQ/TW")) {
          // ward result should reference specific resolution
          return { data, error: new BadCitation(header) };
        }

        const wardFromDb = newWardsFromDb[result.ward_code];
        if (typeof wardFromDb !== "string") {
          return { data, error: new UnknownUnit(result.ward_code) };
        }
        outputWardCodes.add(result.ward_code);

        if (!normalizedLine.includes(normalize(wardFromDb))) {
          // quoted line should contain the ward name
          return { data, error: new UnrelatedCitation(line, wardFromDb) };
        }
      } else {
        if (!header.startsWith("60-NQ/TW")) {
          // province result should reference the master resolution
          return { data, error: new BadCitation(header) };
        }

        const provinceFromDb = newProvincesFromDb[result.province_code];
        if (typeof provinceFromDb !== "string") {
          return { data, error: new UnknownUnit(result.province_code) };
        }
        outputProvinceCodes.add(result.province_code);

        if (!normalizedLine.includes(normalize(provinceFromDb))) {
          // quoted line should contain the province name
          return { data, error: new UnrelatedCitation(line, provinceFromDb) };
        }
      }
    }

    return { data };
  } catch (reason) {
    const error = reason instanceof Error ? reason : new Error(`${reason}`);
    return { error };
  }
}

const newData: NewUnit[] = JSON.parse(readFileSync("./tmp/new.json", "utf8"));
const newWardsFromDb: Record<string, string> = {};
const newProvincesFromDb: Record<string, string> = {};
const outputWardCodes = new Set<string>();
const outputProvinceCodes = new Set<string>();

function main() {
  const outputDir = "./output";
  const jsonFiles = findJsonFiles(outputDir);
  console.log(`Found ${jsonFiles.length} JSON files to analyze`);

  for (const unit of newData) {
    const { ward_code } = unit;
    if (typeof ward_code === "string") {
      newWardsFromDb[ward_code] = unit.ward_name;
    } else {
      newProvincesFromDb[unit.province_code] = unit.province_name;
    }
  }
  console.log(
    `Found ${Object.keys(newWardsFromDb).length} wards and ${
      Object.keys(newProvincesFromDb).length
    } provinces in database`
  );

  for (const filePath of jsonFiles) {
    const analysis = analyzeFile(filePath);

    const { error } = analysis;
    if (typeof error === "undefined") {
      // no error, continue
      continue;
    }

    console.log(filePath);
    if (error instanceof v.ValiError) {
      // delete for re-run
      rmSync(filePath);
      console.log(`Deleted invalid JSON file: ${filePath}`);
      continue;
    }

    if (error instanceof BadCitation || error instanceof UnrelatedCitation) {
      // delete for re-run
      rmSync(filePath);
      console.log(`Deleted bad citation: ${filePath}: ${error.message}`);
      continue;
    }

    const data = analysis.data!;
    if (error instanceof LowConfidence) {
      console.log(data.thought);
      for (const result of data.result) {
        if (result.confidence === "low") {
          console.log(result);
        }
      }
      // stop for manual review
      process.exit(1);
    }

    // other errors
    console.log(error.message);
  }

  let missingWards = 0;
  for (const code of Object.keys(newWardsFromDb)) {
    if (!outputWardCodes.has(code)) {
      missingWards++;
      console.error(`Missing ward in output: ${code}`);
    }
  }
  if (missingWards === 0) {
    console.log("All wards are present in output");
  }

  let missingProvinces = 0;
  for (const code of Object.keys(newProvincesFromDb)) {
    if (!outputProvinceCodes.has(code)) {
      missingProvinces++;
      console.error(`Missing province in output: ${code}`);
    }
  }
  if (missingProvinces === 0) {
    console.log("All provinces are present in output");
  }
}

// Run the analysis
if (require.main === module) {
  main();
}
