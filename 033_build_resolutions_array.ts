import * as fs from "fs";
import * as path from "path";
import removeAccents from "remove-accents";

export interface Resolution {
  header: string; // e.g., "1234/NQ-UBTVQH15: Sắp xếp các đơn vị hành chính cấp xã của tỉnh ..."
  lines: string[]; // e.g., ["1. Sắp xếp ...", "2. Đổi tên ...", ...]
}

function processResolutionFiles(): Resolution[] {
  const docsDir = "./input/docs";
  const files = fs.readdirSync(docsDir);
  const mdFiles = files.filter((file) => file.endsWith("_NQ-UBTVQH15.md"));

  const resolutions: Resolution[] = [];

  mdFiles.forEach((file) => {
    const fileMatch = file.match(/^(?<number>\d+)_NQ-UBTVQH15\.md$/);
    if (!fileMatch) {
      return;
    }

    const filePath = path.join(docsDir, file);
    let content = fs.readFileSync(filePath, "utf8");

    // Replace single new lines with single space
    content = content.replace(/\n+/g, (str) => (str.length === 1 ? " " : str));
    // Normalize to composed form
    content = content.normalize("NFC");

    const headerMatches = content.match(/\*\*Điều 1\. ([^*]+)\*\*/);
    if (!headerMatches) {
      console.error(content);
      console.log(`No header found in ${file}`);
      process.exit(1);
    }

    const header = `${
      fileMatch.groups!.number
    }/NQ-UBTVQH15: ${headerMatches[1].trim()}`;
    content = content.slice(headerMatches.index! + headerMatches[0].length);

    const matches = content.matchAll(
      /(?<number>\d+)[\s\\\.]+(?<line>(Đổi tên|Nhập|Sắp xếp|Sau khi)[^.]+\.)/g
    );

    let latestIndex = 0;
    const lines: string[] = [];
    for (const match of matches) {
      latestIndex = match.index! + match[0].length;
      const { number, line } = match.groups!;
      lines.push(`${number}. ${line}`);
    }

    // Validate that after the last line there is a "Điều 2"
    const next = content.slice(latestIndex, latestIndex + 20);
    if (next.match(/Điều 2/) === null) {
      console.error(content);
      console.log(lines);
      console.log(
        `Immature end of file in ${file} at index ${latestIndex}: ${next}`
      );
      process.exit(1);
    }

    // Validate line content
    validateLines(lines, file);

    resolutions.push({
      header,
      lines,
    });
  });

  return resolutions;
}

function validateLines(lines: string[], filename: string): void {
  if (lines.length === 0) {
    console.error(`No lines found in ${filename}`);
    process.exit(1);
  }

  // Check sequential numbering starting from 1
  for (let i = 0; i < lines.length; i++) {
    const expectedNumber = i + 1;
    if (!lines[i].startsWith(`${expectedNumber}. `)) {
      console.error(
        `Line ${i + 1} in ${filename} does not start with "${expectedNumber}. "`
      );
      process.exit(1);
    }
  }

  // Check that each line is a complete sentence (ends with period)
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].endsWith(".")) {
      console.error(
        `Line ${i + 1} in ${filename} is not a complete sentence: ${lines[i]}`
      );
      process.exit(1);
    }
  }

  // Check that last line starts with "sau khi""
  const lastLine = lines[lines.length - 1];
  const lineContent = lastLine.substring(lastLine.indexOf(". ") + 2);
  const normalizedContent = removeAccents(lineContent.toLowerCase());
  if (!normalizedContent.startsWith("sau khi")) {
    console.error(
      `Last line in ${filename} does not start with "Sau khi": ${lineContent}`
    );
    process.exit(1);
  }
}

async function main() {
  try {
    console.log("Processing NQ-UBTVQH15 resolution files...");

    const resolutions = processResolutionFiles();

    // Verify exactly 34 resolutions
    if (resolutions.length !== 34) {
      console.error(`Expected 34 resolutions, found ${resolutions.length}`);
      process.exit(1);
    }

    // Ensure tmp directory exists
    const tmpDir = path.join(process.cwd(), "tmp");
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Write output
    const outputPath = path.join(tmpDir, "resolutions.json");
    fs.writeFileSync(outputPath, JSON.stringify(resolutions, null, 2));

    console.log(`Successfully processed ${resolutions.length} resolutions`);
    console.log(`Output written to ${outputPath}`);

    // Log summary
    const totalLines = resolutions.reduce(
      (sum, res) => sum + res.lines.length,
      0
    );
    console.log(`Total lines across all resolutions: ${totalLines}`);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
