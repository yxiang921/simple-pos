/**
 * Photos for the sample café menu, from Wikimedia Commons. All are free to use
 * under the licence shown (CC0 = no conditions; CC BY / CC BY-SA = credit the
 * author and licence). Images are served by Wikimedia (Special:FilePath gives a
 * resized copy), so nothing is stored in this repository.
 *
 * Client-safe (used by the guest menu to show photo credits).
 */

export type MenuPhoto = {
  /** File name on Wikimedia Commons (without "File:"). */
  file: string;
  author: string;
  license: "CC0" | "PD" | "CC BY 2.0" | "CC BY 2.5" | "CC BY 3.0" | "CC BY-SA 2.0" | "CC BY-SA 3.0" | "CC BY-SA 4.0";
};

const LICENSE_URL: Record<MenuPhoto["license"], string> = {
  CC0: "https://creativecommons.org/publicdomain/zero/1.0/",
  PD: "https://commons.wikimedia.org/wiki/Commons:Public_domain",
  "CC BY 2.0": "https://creativecommons.org/licenses/by/2.0/",
  "CC BY 2.5": "https://creativecommons.org/licenses/by/2.5/",
  "CC BY 3.0": "https://creativecommons.org/licenses/by/3.0/",
  "CC BY-SA 2.0": "https://creativecommons.org/licenses/by-sa/2.0/",
  "CC BY-SA 3.0": "https://creativecommons.org/licenses/by-sa/3.0/",
  "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
};

/** Sample menu item name → photo. */
export const MENU_PHOTOS: Record<string, MenuPhoto> = {
  "Nasi Lemak Ayam Goreng": { file: "Nasi Lemak Ayam, ABC Bistro Cafe Brickfields, 2023 (01).jpg", author: "Bahnfrend", license: "CC BY-SA 4.0" },
  "Nasi Lemak Biasa": { file: "Nasi lemak basic.jpg", author: "Craig (Pizzaboy1)", license: "CC BY 3.0" },
  "Mee Goreng Mamak": { file: "Mi goreng.JPG", author: "Midori", license: "CC BY-SA 3.0" },
  "Char Kway Teow": { file: "Char kway teow.jpg", author: "Elizetang", license: "PD" },
  "Chicken Burger": { file: "Chicken burger @ Poulet Poulette @ Paris (33649923474).jpg", author: "Guilhem Vellut", license: "CC BY 2.0" },
  "Chicken Burger Combo": { file: "Hamburger + fries @ Big Fernand @ Boulogne-Billancourt (27710537053).jpg", author: "Guilhem Vellut", license: "CC BY 2.0" },
  "French Fries": { file: "French Fries.JPG", author: "StockSnap (Pixabay)", license: "CC0" },
  "Roti Bakar Kaya": { file: "Ya Kun Kaya Toast.JPG", author: "Terence Ong", license: "CC BY 2.5" },
  "Half-Boiled Eggs (2)": { file: "Kaya toast dip into soft boiled egg.jpg", author: "Pinklily08", license: "CC BY-SA 4.0" },
  "Roti Canai with Dhal": { file: "Roti canai with dal in Kuala Lumpur, July 2014.jpg", author: "Sunnya343", license: "CC BY-SA 4.0" },
  "Teh Tarik": { file: "Teh Tarik.jpg", author: "Jonathan Lin", license: "CC BY-SA 2.0" },
  "Kopi O": { file: "Kopi O.jpg", author: "Digital Terrorist (Flickr)", license: "CC BY-SA 2.0" },
  "Milo Ais": { file: "Iced Milo.jpg", author: "Lilblackdog29", license: "CC BY-SA 4.0" },
  "Limau Ais": { file: "Calamansi juice (Filipino lemonade).jpg", author: "Obsidian Soul", license: "CC0" },
  "Mineral Water": { file: "Blue Waters bottle no label.jpg", author: "Wikimedia Commons contributor", license: "CC0" },
  Cendol: { file: "Cendol.JPG", author: "Brian Smith", license: "CC BY-SA 3.0" },
};

const FILEPATH = "https://commons.wikimedia.org/wiki/Special:FilePath/";

/** Resized image URL (Wikimedia redirects to a cached thumbnail of that width). */
export function photoUrl(file: string, width = 640) {
  return `${FILEPATH}${encodeURIComponent(file.replace(/ /g, "_"))}?width=${width}`;
}

export function photoPage(file: string) {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, "_"))}`;
}

const BY_URL = new Map(Object.values(MENU_PHOTOS).map((p) => [photoUrl(p.file), p]));

/** Credit for an image URL set from MENU_PHOTOS (null for the shop's own photos). */
export function photoCredit(imageUrl: string | null | undefined) {
  const p = imageUrl ? BY_URL.get(imageUrl) : undefined;
  if (!p) return null;
  return { ...p, page: photoPage(p.file), licenseUrl: LICENSE_URL[p.license] };
}

/** Photo URL for a menu item name (exact sample-menu names only). */
export function samplePhotoFor(name: string): string | null {
  const p = MENU_PHOTOS[name];
  return p ? photoUrl(p.file) : null;
}
