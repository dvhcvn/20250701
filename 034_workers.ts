import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { GoogleGenAI, Type } from "@google/genai";
import removeAccents from "remove-accents";
import type { Resolution } from "./033_build_resolutions_array";
import type { Unit as NewUnit } from "./032_build_new_array";
import type { Unit as OldUnit } from "./031_build_old_array";

const gemini = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

const numberOfWorkers = 50;

interface NormalizedResolution {
  header: {
    original: string;
    normalized: string;
  };
  lines: Array<{ original: string; normalized: string }>;
}

interface NormalizedNewUnit {
  original: NewUnit;
  normalizedWardName?: string;
  normalizedProvinceName: string;
}

const normalizedResolutions: NormalizedResolution[] = [];
const normalizedNewUnits: NormalizedNewUnit[] = [];

export function normalize(text: string): string {
  const normalized = removeAccents(text.normalize("NFC"))
    .replace(/[yýỳỷỹỵ]/gi, "i")
    .toLowerCase()
    .replace(
      /^(dac khu|phuong|xa|huyen|thi tran nong truong|thi tran nt|thi tran|thi xa|tinh|thanh pho|thu do|tp)/g,
      ""
    )
    .replace(/d/g, "r")
    .replace(/s/g, "x")
    .replace(/ch/g, "tr")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, "");

  if (normalized.length === 0) {
    throw new Error(`Normalized text is empty for "${text}"`);
  }

  return normalized;
}

function initialize(): void {
  const resolutionsData: Array<Resolution> = JSON.parse(
    readFileSync("./tmp/resolutions.json", "utf8")
  );

  for (const { header, lines } of resolutionsData) {
    const normalizedHeader = normalize(header);
    normalizedResolutions.push({
      header: { original: header, normalized: normalizedHeader },
      lines: lines.map((line: string) => ({
        original: line,
        normalized: normalize(line),
      })),
    });
  }

  const newData: NewUnit[] = JSON.parse(readFileSync("./tmp/new.json", "utf8"));

  normalizedNewUnits.push(
    ...newData.map((unit: NewUnit) => ({
      original: unit,
      normalizedWardName:
        typeof unit.ward_name === "string"
          ? normalize(unit.ward_name)
          : undefined,
      normalizedProvinceName: normalize(unit.province_name),
    }))
  );
}

async function findOne(
  ward: string | undefined,
  district: string | undefined,
  province: string
): Promise<{
  address: string;
  ellapsedInMs: number;
  estimatedCost: number;
  thought: string;
  result: unknown;
}> {
  const isFindingNewWard =
    typeof ward === "string" || typeof district === "string";
  const address = [
    ...new Set([ward, district, province].filter((s) => typeof s === "string")),
  ].join(", ");
  const normalizedComponents = [ward, district]
    .filter((s) => typeof s === "string")
    .map(normalize);

  const matchingResolutions: Resolution[] = [];
  const normalizedMatchingResolutions: Resolution[] = [];
  for (const { header, lines } of normalizedResolutions) {
    const matchingLines: typeof lines = [];
    for (const line of lines) {
      for (const component of normalizedComponents) {
        // perform line matching only because header matching is not reliable
        // some provinces have been merged, so the header may not match
        if (line.normalized.includes(component)) {
          matchingLines.push(line);
          break; // `normalizedComponents` loop
        }
      }
    }
    if (matchingLines.length > 0) {
      matchingResolutions.push({
        header: header.original,
        lines: matchingLines.map((line) => line.original),
      });
      normalizedMatchingResolutions.push({
        header: header.normalized,
        lines: matchingLines.map((line) => line.normalized),
      });
    }
  }

  const matchingNewUnits: Record<string, NewUnit> = {};
  for (const unit of normalizedNewUnits) {
    const normalizedWardName = unit.normalizedWardName;
    if (isFindingNewWard) {
      if (typeof normalizedWardName !== "string") {
        continue; // skip if this is NOT a ward
      }

      for (const { lines } of normalizedMatchingResolutions) {
        for (const normalizedLine of lines) {
          if (normalizedLine.includes(normalizedWardName)) {
            matchingNewUnits[unit.original.ward_code ?? ""] = {
              ...unit.original,
            };
          }
        }
      }
    } else {
      if (typeof normalizedWardName === "string") {
        continue; // skip if this IS a ward
      }
      matchingNewUnits[unit.original.province_code] = {
        ...unit.original,
      };
    }
  }

  const prompt = `You are an expert in Vietnamese administrative unit mapping.
The Vietnamese gorvernment has issued resolutions that restructure administrative units, eliminating all districts.
Some provinces have been merged together.
Most of the wards have been renamed / split or merged. A small number of the wards are kept unchanged.
You have access to a database of these resolutions and the new administrative units that were created as a result.

Resolutions:

<resolution>
<header>60-NQ/TW: Các đơn vị hành chính cấp tỉnh không thực hiện sáp nhập</header>
<lines>
1. Thành phố Hà Nội
2. Thành phố Huế
3. Tỉnh Lai Châu
4. Tỉnh Điện Biên
5. Tỉnh Sơn La
6. Tỉnh Lạng Sơn
7. Tỉnh Quảng Ninh
8. Tỉnh Thanh Hoá
9. Tỉnh Nghệ An
10. Tỉnh Hà Tĩnh
11. Tỉnh Cao Bằng
</lines>
</resolution>

<resolution>
<header>60-NQ/TW: Các đơn vị hành chính cấp tỉnh mới sau sáp nhập, hợp nhất</header>
<lines>
1. Hợp nhất tỉnh Tuyên Quang và tỉnh Hà Giang, lấy tên là tỉnh Tuyên Quang
2. Hợp nhất tỉnh Lào Cai và tỉnh Yên Bái, lấy tên là tỉnh Lào Cai
3. Hợp nhất tỉnh Bắc Kạn và tỉnh Thái Nguyên, lấy tên là tỉnh Thái Nguyên
4. Hợp nhất tỉnh Vĩnh Phúc, tỉnh Phú Thọ và tỉnh Hoà Bình; lấy tên là tỉnh Phú Thọ
5. Hợp nhất tỉnh Bắc Ninh và tỉnh Bắc Giang, lấy tên là tỉnh Bắc Ninh
6. Hợp nhất tỉnh Hưng Yên và tỉnh Thái Bình, lấy tên là tỉnh Hưng Yên
7. Hợp nhất tỉnh Hải Dương và thành phố Hải Phòng, lấy tên là thành phố Hải Phòng
8. Hợp nhất tỉnh Hà Nam, tỉnh Ninh Bình và tỉnh Nam Định; lấy tên là tỉnh Ninh Bình
9. Hợp nhất tỉnh Quảng Bình và tỉnh Quảng Trị, lấy tên là tỉnh Quảng Trị
10. Hợp nhất tỉnh Quảng Nam và thành phố Đà Nẵng, lấy tên là thành phố Đà Nẵng
11. Hợp nhất tỉnh Kon Tum và tỉnh Quảng Ngãi, lấy tên là tỉnh Quảng Ngãi
12. Hợp nhất tỉnh Gia Lai và tỉnh Bình Định, lấy tên là tỉnh Gia Lai
13. Hợp nhất tỉnh Ninh Thuận và tỉnh Khánh Hoà, lấy tên là tỉnh Khánh Hoà
14. Hợp nhất tỉnh Lâm Đồng, tỉnh Đắk Nông và tỉnh Bình Thuận; lấy tên là tỉnh Lâm Đồng
15. Hợp nhất tỉnh Đắk Lắk và tỉnh Phú Yên, lấy tên là tỉnh Đắk Lắk
16. Hợp nhất tỉnh Bà Rịa - Vũng Tàu, tỉnh Bình Dương và Thành phố Hồ Chí Minh; lấy tên là Thành phố Hồ Chí Minh
17. Hợp nhất tỉnh Đồng Nai và tỉnh Bình Phước, lấy tên là tỉnh Đồng Nai
18. Hợp nhất tỉnh Tây Ninh và tỉnh Long An, lấy tên là tỉnh Tây Ninh
19. Hợp nhất thành phố cần Thơ, tỉnh Sóc Trăng và tỉnh Hậu Giang; lấy tên là thành phố Cần Thơ
20. Hợp nhất tỉnh Bến Tre, tỉnh Vĩnh Long và tỉnh Trà Vinh; lấy tên là tỉnh Vĩnh Long
21. Hợp nhất tỉnh Tiền Giang và tỉnh Đồng Tháp, lấy tên là tỉnh Đồng Tháp
22. Hợp nhất tỉnh Bạc Liêu và tỉnh Cà Mau, lấy tên là tỉnh Cà Mau
23. Hợp nhất tỉnh An Giang và tỉnh Kiên Giang, lấy tên là tỉnh An Giang
</lines>
</resolution>

${matchingResolutions
  .map((resolution) => {
    return [
      `<resolution>\n<header>${resolution.header}</header>`,
      "<lines>",
      ...resolution.lines,
      "</lines>\n</resolution>",
    ].join("\n");
  })
  .join("\n\n")}

# Units and their ids:

${Object.values(matchingNewUnits)
  .map(({ ward_code, ward_name, province_code, province_name }) =>
    isFindingNewWard
      ? JSON.stringify({
          code: ward_code,
          name: ward_name,
          province: province_name,
        })
      : JSON.stringify({ code: province_code, name: province_name })
  )
  .join("\n")}

Given this old administrative unit: ${address}
Go through each resolution, identify whether the old unit is mentioned.
Find one or multiple new units that may be the new administrative unit containing the old unit, in full or partially.
Make sure to include all possible candidates based on the provided information.
If there are insufficient information or otherwise you are not sure, indicate that the confidence is low.
`;
  console.error(prompt);

  enum Model {
    FLASH = "gemini-2.5-flash",
    PRO = "gemini-2.5-pro",
  }
  let model: Model = Model.FLASH;
  if (Object.keys(matchingNewUnits).length > 1000) {
    // use bigger model if there are too many candidates
    model = Model.PRO;
  }

  const startedAt = Date.now();
  const response = await gemini.models.generateContent({
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            citation: {
              type: Type.OBJECT,
              properties: {
                header: { type: Type.STRING },
                line: { type: Type.STRING },
              },
            },

            ...(isFindingNewWard
              ? {
                  ward_code: { type: Type.STRING },
                  ward_name: { type: Type.STRING },
                  province_name: { type: Type.STRING },
                }
              : {
                  province_code: { type: Type.STRING },
                  province_name: { type: Type.STRING },
                }),

            confidence: { type: Type.STRING, enum: ["high", "low"] },
          },
        },
      },
      temperature: 0,
      thinkingConfig: {
        includeThoughts: true,
      },
    },
    contents: prompt,
    model,
  });
  const ellapsedInMs = Date.now() - startedAt;

  const inputTokenCount = response.usageMetadata?.promptTokenCount ?? 0;
  const totalTokenCount = response.usageMetadata?.totalTokenCount ?? 0;
  const outputTokenCount = totalTokenCount - inputTokenCount;
  const estimatedCost =
    model === Model.FLASH
      ? (inputTokenCount / 1_000_000) * 0.3 + // $0.3 per 1M input tokens
        (outputTokenCount / 1_000_000) * 2.5 // $2.5 per 1M output tokens
      : // https://ai.google.dev/gemini-api/docs/pricing
        (inputTokenCount / 1_000_000) * 2.5 + // $2.5 per 1M input tokens
        (outputTokenCount / 1_000_000) * 15; // $15 per 1M output tokens
  const thought =
    response.candidates?.[0]?.content?.parts
      ?.map((p) => (p.thought === true ? p.text : undefined))
      ?.filter((t) => typeof t === "string")
      ?.join("\n") ?? "";

  console.error({
    ellapsedInMs,
    model,
    thought,
    text: response.text,
    ...response.usageMetadata,
    estimatedCost,
  });
  try {
    return {
      address,
      ellapsedInMs,
      estimatedCost,
      thought,
      result: JSON.parse(response.text!),
    };
  } catch (error) {
    console.warn(response.text || "");
    throw error;
  }
}

async function findAll(): Promise<void> {
  const oldData: OldUnit[] = JSON.parse(readFileSync("./tmp/old.json", "utf8"));
  const itemsPerWorker = Math.ceil(oldData.length / numberOfWorkers) + 1;
  let successCount = 0;
  let totalEllapsedInMs = 0;
  let totalCost = 0;

  const worker = async (workerId: number, min: number, max: number) => {
    console.log(`[${workerId}] Processing ${min}..${max}`);
    for (let i = min; i <= max; i++) {
      const oldUnit = oldData[i];

      const [first, ...codes] = [
        oldUnit.ward_code,
        oldUnit.district_code,
        oldUnit.province_code,
      ].filter((id) => typeof id === "string");
      const path = join("output", ...codes.toReversed(), `${first}.json`);

      let result: Awaited<ReturnType<typeof findOne>>;
      try {
        result = JSON.parse(readFileSync(path, "utf8"));
      } catch (error) {
        result = await findOne(
          oldUnit.ward_name,
          oldUnit.district_name,
          oldUnit.province_name
        );

        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, JSON.stringify(result, null, 2));
      }

      successCount++;
      totalCost += result.estimatedCost;
      totalEllapsedInMs += result.ellapsedInMs;
      const avgCost = totalCost / successCount;
      const avgEllapsedInMs = totalEllapsedInMs / successCount;
      const remainingCount = oldData.length - successCount;
      const estimatedTotalCost = avgCost * oldData.length;
      const estimatedRemainingInMinutes =
        (avgEllapsedInMs * remainingCount) / numberOfWorkers / 1000 / 60;

      console.log(
        [
          `[${workerId}] Processed `,
          `${successCount}/${oldData.length} wards; `,
          `avg: ${Math.ceil(avgCost * 1000)}¢, `,
          `${Math.ceil(avgEllapsedInMs)}ms; `,
          `estimated total cost: \$${Math.ceil(estimatedTotalCost)}, `,
          `time remaining: ${Math.ceil(estimatedRemainingInMinutes)}m`,
        ].join("")
      );
    }
  };

  const promises: Promise<void>[] = [];
  for (let workerId = 0; workerId < numberOfWorkers; workerId++) {
    const min = workerId * itemsPerWorker;
    const max = Math.min(
      (workerId + 1) * itemsPerWorker - 1,
      oldData.length - 1
    );
    promises.push(worker(workerId, min, max));
  }

  await Promise.all(promises);
}

async function main() {
  initialize();
  await findAll();
}

if (require.main === module) {
  main();
}
