#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const ASSETS = path.join(__dirname, '..', 'assets');
const OUT = path.join(ASSETS, 'material.md');

async function main() {
  const pdfs = fs.readdirSync(ASSETS).filter((f) => f.toLowerCase().endsWith('.pdf'));

  if (pdfs.length === 0) {
    console.error('No se encontraron archivos .pdf en assets/');
    process.exit(1);
  }

  console.log(`Convirtiendo ${pdfs.length} PDF(s): ${pdfs.join(', ')}`);

  const sections = [];

  for (const file of pdfs) {
    const filePath = path.join(ASSETS, file);
    const buffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: buffer });
    const data = await parser.getText();
    await parser.destroy();

    const title = path.basename(file, '.pdf');
    const text = cleanText(data.text);

    sections.push(`# ${title}\n\n${text}`);
    console.log(`  ✓ ${file} — ${data.pages.length} página(s), ${text.length} chars`);
  }

  const output = sections.join('\n\n---\n\n');
  fs.writeFileSync(OUT, output, 'utf-8');
  console.log(`\nArchivo generado: assets/material.md (${output.length} chars)`);
}

function cleanText(raw) {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Elimina líneas que son solo números de página
    .replace(/^\s*\d+\s*$/gm, '')
    // Colapsa más de 2 saltos de línea consecutivos
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
