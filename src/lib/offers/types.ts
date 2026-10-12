// A store's current offer for a game's base edition, as reported by CheapShark.
export type Offer = {
  storeId: string;
  storeName: string;
  price: number; // USD
  regularPrice: number; // USD
  savings: number; // percent, 0-100
  dealId: string;
  url: string; // CheapShark's required redirect link
};

// What we know about a game's offers. No entry at all means it hasn't been checked yet.
export type OfferState =
  | { status: "ok"; offers: Offer[]; retrievedAt: string } // offers may be empty: no store listing found
  | { status: "unavailable"; reason: string };

export type OfferMap = Record<string, OfferState | undefined>;
