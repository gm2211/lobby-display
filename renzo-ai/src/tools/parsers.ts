// Cheerio HTML parsers for CC HTML-partial endpoints

import * as cheerio from "cheerio";
import type {
  ParsedAmenityCard,
  ParsedBookingCard,
  ParsedTimeSlot,
  PricingInfo,
} from "./types.js";
import { debug } from "./logger.js";

/** Parse amenity grid cards from GET /amenity/get-amenity-list/ */
export function parseAmenityList(html: string): ParsedAmenityCard[] {
  debug(`[parser] parseAmenityList() input length: ${html.length}`);
  const $ = cheerio.load(html);
  const cards: ParsedAmenityCard[] = [];

  const selector = ".card, .amenity-card, [class*='amenity'], .col-sm-4, .col-md-4, .col-lg-3";
  const matchCount = $(selector).length;
  debug(`[parser] Primary selector "${selector}" matched ${matchCount} elements`);

  // Amenity cards are in repeating card elements
  $(selector).each((_, el) => {
    const $el = $(el);
    const name = $el.find("h4, h3, .card-title, .amenity-name, a[href*='amenity']").first().text().trim();
    if (!name) return;

    const imgEl = $el.find("img").first();
    const imageUrl = imgEl.attr("src") || imgEl.attr("data-src") || null;

    const feeLabel = $el.find("[class*='fee'], [class*='price'], .badge").first().text().trim() || null;

    const linkEl = $el.find("a[href*='amenity']").first();
    const bookingUrl = linkEl.attr("href") || null;

    // Extract amenity ID from URL
    const idMatch = bookingUrl?.match(/amenityid=(\d+)|amenity-details\/(\d+)|\/(\d+)/i);
    const amenityId = idMatch ? parseInt(idMatch[1] || idMatch[2] || idMatch[3], 10) : null;

    cards.push({ name, imageUrl, feeLabel, bookingUrl, amenityId });
  });

  debug(`[parser] Primary parse found ${cards.length} cards`);

  // Fallback: if no cards found, try broader selectors
  if (cards.length === 0) {
    const fallbackCount = $("a[href*='amenity']").length;
    debug(`[parser] Fallback selector "a[href*='amenity']" matched ${fallbackCount} elements`);
    $("a[href*='amenity']").each((_, el) => {
      const $el = $(el);
      const name = $el.text().trim();
      if (!name || name.length > 100) return;

      const bookingUrl = $el.attr("href") || null;
      const idMatch = bookingUrl?.match(/amenityid=(\d+)|amenity-details\/(\d+)/i);
      const amenityId = idMatch ? parseInt(idMatch[1] || idMatch[2], 10) : null;

      cards.push({ name, imageUrl: null, feeLabel: null, bookingUrl, amenityId });
    });
  }

  debug(`[parser] parseAmenityList() returning ${cards.length} cards`);
  return cards;
}

/** Parse booking cards from POST /amenity/search-amenity-booking */
export function parseBookingCards(html: string): ParsedBookingCard[] {
  const $ = cheerio.load(html);
  const cards: ParsedBookingCard[] = [];

  $(".boxWithShadow, .booking-card, [class*='booking']").each((_, el) => {
    const $el = $(el);

    // Booking ID from link
    const viewLink = $el.find("a[href*='/amenity/View/'], a[href*='/amenity/view/']").first();
    const viewUrl = viewLink.attr("href") || null;
    const bookingId = viewUrl?.match(/\/(\d+)\/?$/)?.[1] || null;

    // Amenity name from the link text
    const amenityName = viewLink.text().trim() || $el.find("h4, h3, strong").first().text().trim();

    // Status from colored span
    const statusEl = $el.find("span[style*='color'], .badge, .status").first();
    const status = statusEl.text().trim() || null;

    // Date and time — look for date-like text
    const allText = $el.text();
    const dateMatch = allText.match(/(\d{1,2}\/\d{1,2}\/\d{4}|\w+ \d{1,2},? \d{4})/);
    const date = dateMatch ? dateMatch[1] : null;
    const timeMatch = allText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)\s*-\s*\d{1,2}:\d{2}\s*(?:AM|PM))/i);
    const time = timeMatch ? timeMatch[1] : null;

    // Unit number
    const unitMatch = allText.match(/unit[:\s]*(\w+)/i) || allText.match(/\((\d+)\)/);
    const unit = unitMatch ? unitMatch[1] : null;

    if (amenityName) {
      cards.push({ bookingId, amenityName, date, time, status, unit, viewUrl });
    }
  });

  return cards;
}

/** Parse time slot options from amenity rules HTML form */
export function parseTimeSlots(html: string): ParsedTimeSlot[] {
  debug(`[parser] parseTimeSlots() input length: ${html.length}`);
  const $ = cheerio.load(html);
  const slots: ParsedTimeSlot[] = [];

  const selector = "#SelectedAmenityTimeSlotID option, select[name='SelectedAmenityTimeSlotID'] option";
  const matchCount = $(selector).length;
  debug(`[parser] Time slot selector matched ${matchCount} elements`);

  // Also dump all <select> elements for debugging
  const allSelects = $("select").length;
  debug(`[parser] Total <select> elements in HTML: ${allSelects}`);
  $("select").each((i, el) => {
    const name = $(el).attr("name") || "(unnamed)";
    const id = $(el).attr("id") || "(no id)";
    const optCount = $(el).find("option").length;
    debug(`[parser]   select[${i}]: name=${name} id=${id} options=${optCount}`);
  });

  $(selector).each(
    (_, el) => {
      const $el = $(el);
      const id = $el.attr("value") || "";
      const label = $el.text().trim();
      debug(`[parser]   time slot option: value="${id}" label="${label}"`);
      if (id && label && id !== "") {
        slots.push({ id, label });
      }
    }
  );

  debug(`[parser] parseTimeSlots() returning ${slots.length} slots`);
  return slots;
}

/** Parse hidden form fields from amenity rules booking form */
export function parseBookingFormFields(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  const fields: Record<string, string> = {};

  $("form input[type='hidden'], form input[name]").each((_, el) => {
    const name = $(el).attr("name");
    const value = $(el).attr("value") || "";
    if (name) {
      fields[name] = value;
    }
  });

  return fields;
}

/** Parse pricing info from GET /amenity/update-pricing-structure/ */
export function parsePricingInfo(html: string): PricingInfo {
  const $ = cheerio.load(html);
  const text = $.text();

  // Extract fee
  const feeMatch = text.match(/(?:fee|price|cost|charge)[:\s]*\$?([\d.,]+|free|no fee)/i);
  const fee = feeMatch ? feeMatch[1] : null;

  // Extract cancellation policy
  const cancelMatch = text.match(
    /(?:cancellation|cancel)[^.]*\./i
  );
  const cancellationPolicy = cancelMatch ? cancelMatch[0].trim() : null;

  // Extract rule lines
  const rules: string[] = [];
  $("li, p").each((_, el) => {
    const line = $(el).text().trim();
    if (line && line.length > 10 && line.length < 500) {
      rules.push(line);
    }
  });

  return { fee, cancellationPolicy, rules };
}
