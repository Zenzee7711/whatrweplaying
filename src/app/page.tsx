import Explorer from "@/components/Explorer";
import { getGame } from "@/lib/catalogue";
import { filtersFromParams, shortlistFromParam } from "@/lib/search/url";
import { groqConfig, igdbConfig } from "@/lib/server/env";

// Reads shared filters and a shared shortlist from the link (both validated), then hands
// over to the interactive explorer. Only yes/no flags about AI and game search reach the
// browser, never the keys.
export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  return (
    <Explorer
      initialFilters={filtersFromParams(params)}
      sharedList={shortlistFromParam(params.list, (id) => getGame(id) !== undefined)}
      aiAvailable={groqConfig() !== null}
      allGames={igdbConfig() !== null}
    />
  );
}
