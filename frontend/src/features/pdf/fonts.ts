// Unicode font for the PDF (Latin incl. accents, Greek, Cyrillic, arrows, common symbols).
// DejaVu Sans, Bitstream Vera license: see fonts/LICENSE-DejaVu.txt.
import { Font } from '@react-pdf/renderer';
import { PDF_FONT } from './font-family';
import boldUrl from './fonts/DejaVuSans-Bold.ttf?url';
import regularUrl from './fonts/DejaVuSans.ttf?url';

let registered = false;

/** Registers the PDF font once; `srcs` lets non-browser callers pass file paths. */
export function registerPdfFonts(srcs = { regular: regularUrl, bold: boldUrl }) {
  if (registered) return;
  Font.register({
    family: PDF_FONT,
    fonts: [{ src: srcs.regular }, { src: srcs.bold, fontWeight: 'bold' }],
  });
  // Don't break words with hyphens (place names read badly when split).
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
