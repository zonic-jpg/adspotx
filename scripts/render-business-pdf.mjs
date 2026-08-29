#!/usr/bin/env node
/**
 * Render docs/ADSPOT_FEATURES_AND_BUSINESS_20260722.md to PDF.
 * Uses jspdf with useObjectStreams: false for macOS Preview compatibility.
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
const MD_PATH = join(ROOT, "docs/ADSPOT_FEATURES_AND_BUSINESS_20260722.md");
const OUT_PATH = join(ROOT, "docs/ADSPOT_FEATURES_AND_BUSINESS_20260722.pdf");
const DOC_DATE = "22 July 2026";

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = PAGE_H - 10;
const HEADER_Y = 12;

const md = readFileSync(MD_PATH, "utf8");

const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
doc.setProperties({
  title: "AdSpot Features & Business Analysis",
  subject: `AdSpot business document — ${DOC_DATE}`,
});

let y = 24;
let pageNum = 1;

function drawHeaderFooter() {
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text(`AdSpot — Features & Business Analysis | ${DOC_DATE}`, MARGIN, HEADER_Y);
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

function writeWrapped(text, size, style = "normal", indent = 0) {
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
  const lines = doc.splitTextToSize(sanitize(text), CONTENT_W - indent);
  const lh = size * 0.45;
  for (const line of lines) {
    ensure(lh);
    doc.text(line, MARGIN + indent, y);
    y += lh;
  }
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
          const wrapped = doc.splitTextToSize(sanitize(cell), colW - cellPad * 2);
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

  if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
    writeWrapped(`- ${trimmed.slice(2)}`, 9.5, "normal", 4);
    i++;
    continue;
  }

  if (trimmed.startsWith("*") && trimmed.endsWith("*") && !trimmed.startsWith("**")) {
    writeWrapped(trimmed.replace(/^\*|\*$/g, ""), 9, "italic");
    i++;
    continue;
  }

  const boldDate = trimmed.replace(/\*\*([^*]+)\*\*/g, "$1");
  writeWrapped(boldDate, 9.5, trimmed.includes("**") ? "bold" : "normal");
  i++;
}

const pdfBytes = doc.output("arraybuffer", { useObjectStreams: false });
writeFileSync(OUT_PATH, Buffer.from(pdfBytes));
console.log(`PDF written: ${OUT_PATH}`);
