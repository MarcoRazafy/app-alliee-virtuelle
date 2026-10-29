function makePdf(pages) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>'];
  const kids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  const fontRef = 3 + pages.length * 2;
  pages.forEach(({ width, height, text }) => {
    const pageRef = objects.length + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents ${pageRef + 1} 0 R ` +
        `/Resources << /Font << /F1 ${fontRef} 0 R >> >> >>`
    );
    const content = `BT /F1 24 Tf 30 ${height - 60} Td (${text}) Tj ET`;
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let body = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

module.exports = { makePdf };
