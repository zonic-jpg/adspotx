#!/usr/bin/env node
/**
 * Render docs/ADSPOTX-COMPLETE-OVERVIEW.md to AdSpotX.pdf
 * Embeds screenshots from docs/adspotx-screenshots/
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { jsPDF } = require(
  process.env.JSPDF_PATH ??
    new URL("../node_modules/jspdf", import.meta.url).pathname,
);

const ROOT = process.env.ADSPOT_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const MD_PATH = join(ROOT, "docs/ADSPOTX-COMPLETE-OVERVIEW.md");
const OUT_PROJECT = join(ROOT, "docs/AdSpotX.pdf");
const OUT_DOWNLOADS = join(process.env.HOME ?? "/tmp", "Downloads", "AdSpotX.pdf");
const DOC_DATE = "4 August 2026";
const DOC_TITLE = "AdSpotX — Complete Platform Overview";

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = PAGE_H - 10;
const HEADER_Y = 12;

const md = readFileSync(MD_PATH, "utf8");
const lines = md.split("\n");

const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
doc.setProperties({
  title: DOC_TITLE,
  subject: `AdSpotX complete overview — ${DOC_DATE}`,
});

let y = 24;
let pageNum = 1;
let skipManualToc = false;

function drawHeaderFooter() {
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text(`${DOC_TITLE} | ${DOC_DATE}`, MARGIN, HEADER_Y);
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
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[₦]/g, "NGN ")
    .replace(/[—–]/g, "-")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[→]/g, "->")
    .replace(/[·•]/g, "-");
}

function stripInlineFormatting(text) {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
}

function writeWrapped(text, size, style = "normal", indent = 0, font = "helvetica") {
  doc.setFont(font, style);
  doc.setFontSize(size);
  const linesOut = doc.splitTextToSize(sanitize(text), CONTENT_W - indent);
  const lh = size * 0.52;
  for (const line of linesOut) {
    ensure(lh);
    doc.text(line, MARGIN + indent, y);
    y += lh;
  }
}

function writeCodeBlock(codeLines) {
  const fontSize = 8;
  const lh = 3.6;
  const pad = 2;
  doc.setFont("courier", "normal");
  doc.setFontSize(fontSize);
  const wrapped = doc.splitTextToSize(sanitize(codeLines.join("\n")), CONTENT_W - pad * 2);
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
  return line.split("|").slice(1, -1).map((c) => c.trim());
}

function isTableSep(line) {
  return /^\|[\s\-:|]+\|$/.test(line.trim());
}

function resolveImagePath(src) {
  const candidates = [
    resolve(ROOT, src),
    resolve(dirname(MD_PATH), src),
    join(ROOT, "docs/adspotx-screenshots", src),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function writeImage(src, alt) {
  const path = resolveImagePath(src);
  if (!path) {
    writeWrapped(`[Image missing: ${alt || src}]`, 9, "italic");
    return;
  }
  const data = readFileSync(path);
  const base64 = `data:image/png;base64,${data.toString("base64")}`;
  const maxW = CONTENT_W;
  const maxH = 100;
  let w = maxW;
  let h = maxH;
  try {
    doc.addImage(base64, "PNG", MARGIN, y, w, h, undefined, "FAST");
    y += h + 4;
    if (alt) {
      writeWrapped(alt, 8, "italic");
      y += 2;
    }
  } catch (err) {
    writeWrapped(`[Could not embed image: ${alt || src}]`, 9, "italic");
  }
}

function collectHeadings() {
  const headings = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("## Part ") || t.startsWith("## ")) headings.push({ level: 1, text: t.slice(3) });
    else if (t.startsWith("### ")) headings.push({ level: 2, text: t.slice(4) });
  }
  return headings;
}

function renderTitlePage() {
  y = 60;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(20, 60, 120);
  doc.text("AdSpotX", MARGIN, y);
  y += 14;
  doc.setFontSize(15);
  doc.setTextColor(0);
  writeWrapped("Integrated AdSpot + Partner Network Platform", 15, "bold");
  y += 6;
  writeWrapped(`Document date: ${DOC_DATE}`, 11, "normal");
  y += 4;
  writeWrapped("Confidential — AdSpot Nigeria / Africa", 10, "italic");
  y += 18;
  doc.setDrawColor(20, 60, 120);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 10;
  writeWrapped(
    "Architecture · Installation · CI/CD · Personas · Market Analysis · Revenue Forecasts · Partner Flow",
    10,
    "normal",
  );
  drawHeaderFooter();
}

function renderGeneratedToc(headings) {
  newPage();
  y += 4;
  writeWrapped("Table of Contents", 14, "bold");
  y += 4;
  for (const h of headings.slice(0, 40)) {
    const indent = h.level === 1 ? 0 : 8;
    writeWrapped(h.text, h.level === 1 ? 10.5 : 9.5, h.level === 1 ? "bold" : "normal", indent);
    y += 1;
  }
}

renderTitlePage();
const headings = collectHeadings();
renderGeneratedToc(headings);
newPage();

let i = 0;
while (i < lines.length) {
  const line = lines[i];
  const trimmed = line.trim();

  if (!trimmed) {
    y += 2;
    i++;
    continue;
  }

  if (trimmed === "## Table of Contents") {
    skipManualToc = true;
    i++;
    continue;
  }
  if (skipManualToc) {
    if (trimmed.startsWith("## ") && trimmed !== "## Table of Contents") skipManualToc = false;
    else {
      i++;
      continue;
    }
  }

  const imgMatch = trimmed.match(/^!\[(.*?)\]\((.+)\)$/);
  if (imgMatch) {
    ensure(105);
    writeImage(imgMatch[2], imgMatch[1]);
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

  if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
    i++;
    continue;
  }

  if (trimmed.startsWith("## ")) {
    y += 4;
    writeWrapped(trimmed.slice(3), 13, "bold");
    y += 2;
    i++;
    continue;
  }

  if (trimmed.startsWith("### ")) {
    y += 3;
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
          const wrapped = doc.splitTextToSize(sanitize(stripInlineFormatting(cell || "")), colW - cellPad * 2);
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
          const linesForCell = Array.isArray(cellLines[c]) ? cellLines[c] : [""];
          for (const tl of linesForCell) {
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
    writeWrapped(`• ${stripInlineFormatting(trimmed.slice(2))}`, 9.5, "normal", 4);
    i++;
    continue;
  }

  writeWrapped(stripInlineFormatting(trimmed), 9.5, trimmed.includes("**") ? "bold" : "normal");
  i++;
}

const totalPages = pageNum;
const pdfBytes = doc.output("arraybuffer", { useObjectStreams: false });
writeFileSync(OUT_PROJECT, Buffer.from(pdfBytes));
copyFileSync(OUT_PROJECT, OUT_DOWNLOADS);

console.log(`PDF written: ${OUT_PROJECT}`);
console.log(`PDF copied:  ${OUT_DOWNLOADS}`);
console.log(`Page count:  ${totalPages}`);
