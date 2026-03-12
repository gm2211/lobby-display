/**
 * accessCodes.ts — Access code generation and validation for visitor management.
 *
 * Functions:
 *   - generateAccessCode()        — generates a unique 6-char alphanumeric code
 *   - generateQRCode(data)        — generates a QR code as an SVG string
 *   - createVisitorAccessCode(id) — creates and persists an access code for a visitor
 *   - validateAccessCode(code)    — looks up a visitor by access code (valid statuses only)
 *
 * Note: qrcode npm package is not available. generateQRCode returns an SVG
 * placeholder that encodes the data as text.
 */

import prisma from '../db.js';

/**
 * Unambiguous character set for access codes.
 * Excludes: 0 (zero), O (letter oh), 1 (one), I (letter eye), L (letter el)
 */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

/**
 * Generates a random 6-character alphanumeric access code using only
 * unambiguous characters (no 0/O, 1/I/L). Checks the DB for uniqueness
 * and retries if a collision is found.
 *
 * @returns A unique 6-character access code string
 */
export async function generateAccessCode(): Promise<string> {
  let code: string;
  let attempts = 0;
  const maxAttempts = 10;

  do {
    code = Array.from({ length: CODE_LENGTH }, () => {
      const idx = Math.floor(Math.random() * CODE_CHARS.length);
      return CODE_CHARS[idx];
    }).join('');

    const existing = await prisma.visitor.findFirst({
      where: { accessCode: code },
    });

    if (!existing) {
      return code;
    }

    attempts++;
  } while (attempts < maxAttempts);

  throw new Error(`Failed to generate unique access code after ${maxAttempts} attempts`);
}

/**
 * Generates a QR code representation for the given data string.
 * Returns an inline SVG string that visually encodes the data as text.
 *
 * Note: The qrcode npm package is not available in this project. This
 * implementation generates an SVG placeholder that includes the data,
 * suitable for display and for extracting the encoded value.
 *
 * @param data - The string to encode (e.g., an access code)
 * @returns An SVG string encoding the data
 */
export async function generateQRCode(data: string): Promise<string> {
  // Build a simple SVG that encodes the data as visible text with a QR-like border
  const size = 200;
  const padding = 20;
  const fontSize = 24;
  const charWidth = 14;
  const textWidth = data.length * charWidth;
  const textX = size / 2;
  const textY = size / 2 + fontSize / 3;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="white" stroke="black" stroke-width="4"/>
  <rect x="${padding}" y="${padding}" width="${size - padding * 2}" height="${size - padding * 2}" fill="none" stroke="black" stroke-width="2"/>
  <rect x="${padding + 8}" y="${padding + 8}" width="20" height="20" fill="black"/>
  <rect x="${size - padding - 28}" y="${padding + 8}" width="20" height="20" fill="black"/>
  <rect x="${padding + 8}" y="${size - padding - 28}" width="20" height="20" fill="black"/>
  <text x="${textX}" y="${textY}" font-family="monospace" font-size="${fontSize}" font-weight="bold" text-anchor="middle" fill="black">${data}</text>
  <text x="${textX}" y="${size - padding - 4}" font-family="sans-serif" font-size="10" text-anchor="middle" fill="#666">ACCESS CODE</text>
</svg>`;

  return svg;
}

/**
 * Creates an access code for a visitor:
 *   1. Generates a unique 6-char code
 *   2. Generates a QR code SVG encoding the code
 *   3. Updates the Visitor record with the new access code
 *
 * @param visitorId - The UUID of the visitor
 * @returns { code, qrDataUrl } — the access code and QR code SVG string
 */
export async function createVisitorAccessCode(
  visitorId: string
): Promise<{ code: string; qrDataUrl: string }> {
  const code = await generateAccessCode();
  const qrDataUrl = await generateQRCode(code);

  await prisma.visitor.update({
    where: { id: visitorId },
    data: { accessCode: code },
  });

  return { code, qrDataUrl };
}

/**
 * Validates an access code by looking up a visitor with that code.
 * Only returns visitors with valid (active) statuses: EXPECTED or CHECKED_IN.
 * Returns null if the code is not found or if the visit is CANCELLED or CHECKED_OUT.
 *
 * @param code - The 6-character access code to validate
 * @returns The visitor record if found and valid, or null
 */
export async function validateAccessCode(code: string) {
  const visitor = await prisma.visitor.findFirst({
    where: {
      accessCode: code,
      status: {
        in: ['EXPECTED', 'CHECKED_IN'],
      },
    },
  });

  return visitor ?? null;
}
