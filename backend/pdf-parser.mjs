import { PDFParse } from 'pdf-parse';

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
const PDF_HEADER_PATTERN = /%PDF-/;

export async function parsePdfBuffer(input) {
  const data = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (data.length === 0 || data.length > MAX_PDF_BYTES) {
    throw new Error(`Il PDF deve avere dimensione compresa tra 1 e ${MAX_PDF_BYTES} byte.`);
  }
  if (!PDF_HEADER_PATTERN.test(data.subarray(0, 1024).toString('latin1'))) {
    throw new Error('Il contenuto scaricato non è un PDF valido.');
  }

  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    const text = result.text
      .replace(/\u0000/g, '')
      .split(/\r?\n/)
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
      .trim();
    if (!text) throw new Error('Il PDF non contiene testo estraibile.');
    return text;
  } finally {
    await parser.destroy();
  }
}
