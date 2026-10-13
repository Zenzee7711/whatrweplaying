import type { OfferState } from "@/lib/offers/types";
import { money } from "./labels";

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// Store offers, lowest price first, each linking through CheapShark's redirect.
export default function OffersTable({
  title,
  state,
  store,
  edition,
}: {
  title: string;
  state: OfferState | undefined;
  store: string | null;
  edition: string;
}) {
  if (!state) return <p className="mt-2 text-sm text-muted">Checking prices…</p>;
  if (state.status === "unavailable") return <p className="mt-2 text-sm text-muted">Price unavailable: {state.reason}.</p>;
  if (state.offers.length === 0) return <p className="mt-2 text-sm text-muted">No listing found at the stores we check.</p>;

  return (
    <>
      <table className="mt-2 w-full text-sm">
        <caption className="sr-only">Offers for {title}, lowest price first</caption>
        <thead className="text-left text-xs text-muted">
          <tr>
            <th scope="col" className="py-2 font-medium">Store</th>
            <th scope="col" className="py-2 font-medium">Price</th>
            <th scope="col" className="hidden py-2 font-medium sm:table-cell">Regular</th>
            <th scope="col" className="py-2"><span className="sr-only">Link</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {state.offers.map((offer, i) => (
            <tr key={offer.dealId} className={store && offer.storeId !== store ? "text-muted" : ""}>
              <td className="py-2.5">
                {offer.storeName}
                {i === 0 && <span className="ml-2 text-xs text-verified">Lowest</span>}
              </td>
              <td className="py-2.5 font-semibold">
                {money(offer.price)}
                {offer.savings > 0 && <span className="ml-1.5 text-xs text-accent">−{offer.savings}%</span>}
              </td>
              <td className="hidden py-2.5 text-muted sm:table-cell">{money(offer.regularPrice)}</td>
              <td className="py-2.5 text-right">
                <a
                  href={offer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-line px-3 py-1.5 text-xs hover:border-accent hover:text-accent"
                >
                  Visit store<span className="sr-only"> ({offer.storeName}, opens in a new tab)</span>
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">
        {edition}, prices in USD from CheapShark, checked {time(state.retrievedAt)}. Lowest among checked stores; your
        regional price may differ. A $0 price is a temporary promotion, not free-to-play.
      </p>
    </>
  );
}
