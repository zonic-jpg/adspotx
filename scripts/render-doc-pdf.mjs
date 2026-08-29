#!/usr/bin/env node
/**
 * Render a markdown file to PDF.
 * Uses jspdf with useObjectStreams: false for macOS Preview compatibility.
 *
 * Usage:
 *   node scripts/render-doc-pdf.mjs --input <md> --output <pdf> --title "Doc Title"
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { jsPDF } = require(
  process.env.JSPDF_PATH ??
    new URL("../node_modules/jspdf", import.meta.url).pathname,
);

const ROOT = process.env.ADSPOT_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const DOC_DATE = "22 July 2026";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith("--")) args[key.slice(2)] = argv[++i];
  }
  return args;
}

const { input, output, title } = parseArgs(process.argv);
if (!input || !output || !title) {
  console.error("Usage: node scripts/render-doc-pdf.mjs --input <md> --output <pdf> --title <title>");
  process.exit(1);
}

const MD_PATH = join(ROOT, input);
const OUT_PATH = join(ROOT, output);

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = PAGE_H - 10;
const HEADER_Y = 12;

const md = readFileSync(MD_PATH, "utf8");

const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
doc.setProperties({
  title,
  subject: `${title} — ${DOC_DATE}`,
});

let y = 24;
let pageNum = 1;

function drawHeaderFooter() {
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text(`AdSpot — ${title} | ${DOC_DATE}`, MARGIN, HEADER_Y);
  doc.line(MARGIN, HEADER_Y + 2, PAGE_W - MARGIN, HEADER_Y + 2);
  doc.text(`Confidential — AdSpot Nigeria/Africa | ${DOC_DATE}`, MARGIN, FOOTER_Y);
  doc.text(`Page ${pageNum}`, PAGE_W - MARGIN, FOOTER_Y, { align: "right" });
  doc.setTextColor(0);
}

function newPage() {
  doc.addPage();
  pageNum++;
  y = 24;
  drawHeaderFooter();
}

function ensure(h) {
  if (y + h > FOOTER_Y - 6) newPage();
}

function sanitize(text) {
  return text
    .replace(/[₦]/g, "NGN ")
    .replace(/[—–]/g, "-")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[→]/g, "->")
    .replace(/[·•]/g, "-");
}

function writeWrapped(text, size, style = "normal", indent = 0, font = "helvetica") {
  doc.setFont(font, style);
  doc.setFontSize(size);
  const lines = doc.splitTextToSize(sanitize(text), CONTENT_W - indent);
  const lh = size * 0.52;
  for (const line of lines) {
    ensure(lh);
    doc.text(line, MARGIN + indent, y);
    y += lh;
  }
}

function writeCodeBlock(lines) {
  const fontSize = 8;
  const lh = 3.6;
  const pad = 2;
  const codeText = lines.join("\n");
  doc.setFont("courier", "normal");
  doc.setFontSize(fontSize);
  const wrapped = doc.splitTextToSize(sanitize(codeText), CONTENT_W - pad * 2);
  const blockH = wrapped.length * lh + pad * 2;
  ensure(blockH + 2);
  doc.setFillColor(245, 245, 245);
  doc.rect(MARGIN, y - pad, CONTENT_W, blockH, "F");
  doc.setDrawColor(210);
  doc.rect(MARGIN, y - pad, CONTENT_W, blockH);
  let cy = y;
  for (const line of wrapped) {
    doc.text(line, MARGIN + pad, cy);
    cy += lh;
  }
  y += blockH + 2;
}

function parseTableRow(line) {
  return line
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
}

function isTableSep(line) {
  return /^\|[\s\-:|]+\|$/.test(line.trim());
}

function stripInlineFormatting(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

const lines = md.split("\n");
let i = 0;

drawHeaderFooter();

while (i < lines.length) {
  const line = lines[i];
  const trimmed = line.trim();

  if (!trimmed) {
    y += 2;
    i++;
    continue;
  }

  if (trimmed.startsWith("```")) {
    const codeLines = [];
    i++;
    while (i < lines.length && !lines[i].trim().startsWith("```")) {
      codeLines.push(lines[i]);
      i++;
    }
    if (i < lines.length) i++;
    writeCodeBlock(codeLines);
    continue;
  }

  if (trimmed === "---") {
    ensure(4);
    doc.setDrawColor(200);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 4;
    i++;
    continue;
  }

  if (trimmed.startsWith("# ")) {
    y += 2;
    writeWrapped(trimmed.slice(2), 16, "bold");
    y += 2;
    i++;
    continue;
  }

  if (trimmed.startsWith("## ")) {
    y += 3;
    writeWrapped(trimmed.slice(3), 13, "bold");
    y += 1;
    i++;
    continue;
  }

  if (trimmed.startsWith("### ")) {
    y += 2;
    writeWrapped(trimmed.slice(4), 11, "bold");
    y += 1;
    i++;
    continue;
  }

  if (trimmed.startsWith("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
    const rows = [];
    while (i < lines.length && lines[i].trim().startsWith("|")) {
      if (!isTableSep(lines[i])) rows.push(parseTableRow(lines[i]));
      i++;
    }
    if (rows.length) {
      const colCount = rows[0].length;
      const colW = CONTENT_W / colCount;
      const cellPad = 1.5;
      const fontSize = 8;
      const lh = 3.8;

      for (let r = 0; r < rows.length; r++) {
        let maxLines = 1;
        const cellLines = rows[r].map((cell) => {
          doc.setFont("helvetica", r === 0 ? "bold" : "normal");
          doc.setFontSize(fontSize);
          const wrapped = doc.splitTextToSize(sanitize(stripInlineFormatting(cell)), colW - cellPad * 2);
          maxLines = Math.max(maxLines, wrapped.length);
          return wrapped;
        });
        const rowH = maxLines * lh + cellPad * 2;
        ensure(rowH + 1);

        if (r === 0) {
          doc.setFillColor(245, 245, 245);
          doc.rect(MARGIN, y - cellPad, CONTENT_W, rowH, "F");
        }

        doc.setDrawColor(210);
        doc.rect(MARGIN, y - cellPad, CONTENT_W, rowH);

        let x = MARGIN;
        for (let c = 0; c < colCount; c++) {
          doc.line(x, y - cellPad, x, y - cellPad + rowH);
          doc.setFont("helvetica", r === 0 ? "bold" : "normal");
          doc.setFontSize(fontSize);
          let cy = y;
          for (const tl of cellLines[c]) {
            doc.text(tl, x + cellPad, cy);
            cy += lh;
          }
          x += colW;
        }
        doc.line(MARGIN + CONTENT_W, y - cellPad, MARGIN + CONTENT_W, y - cellPad + rowH);
        y += rowH + 0.5;
      }
      y += 2;
    }
    continue;
  }

  if (/^\d+\.\s/.test(trimmed)) {
    writeWrapped(trimmed, 9.5, "normal", 4);
    i++;
    continue;
  }

  if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
    const body = stripInlineFormatting(trimmed.slice(2));
    const isStatusLine = /^(PASS|FAIL|WARN|SKIP)\b/.test(body.replace(/\*\*/g, ""));
    writeWrapped(`• ${body}`, isStatusLine ? 10 : 10, "normal", 2);
    y += 1;
    i++;
    continue;
  }

  if (trimmed.startsWith("*") && trimmed.endsWith("*") && !trimmed.startsWith("**")) {
    writeWrapped(trimmed.replace(/^\*|\*$/g, ""), 9, "italic");
    i++;
    continue;
  }

  const plain = stripInlineFormatting(trimmed);
  writeWrapped(plain, 9.5, trimmed.includes("**") ? "bold" : "normal");
  i++;
}

const pdfBytes = doc.output("arraybuffer", { useObjectStreams: false });
writeFileSync(OUT_PATH, Buffer.from(pdfBytes));
console.log(`PDF written: ${OUT_PATH}`);
