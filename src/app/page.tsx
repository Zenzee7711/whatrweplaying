import Explorer from "@/components/Explorer";
import { getGame } from "@/lib/catalogue";
import { filtersFromParams, shortlistFromParam } from "@/lib/search/url";

// Reads shared filters and a shared shortlist from the link (both validated), then hands
// over to the interactive explorer.
export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  return (
    <Explorer
      initialFilters={filtersFromParams(params)}
      sharedList={shortlistFromParam(params.list, (id) => getGame(id) !== undefined)}
    />
  );
}
