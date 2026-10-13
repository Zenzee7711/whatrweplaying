import type { Capacity, Connection } from "./schema.ts";

// Turns a PCGamingWiki page's wiki source into our fields. Pure functions, so they can be
// tested against real snippets. Anything unclear becomes null (unknown).

// Reads "|name = value" from a template, or null if the field is absent or empty.
function field(block: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`\\|\\s*${escaped}\\s*=([^\\n]*)`));
  const value = match?.[1].trim() ?? "";
  return value === "" ? null : value;
}

// "true" / "false" are verified answers. "limited", "unknown", "hackable", "n/a" are not a clear yes.
export function parseFlag(value: string | null): boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

// "2-4" -> 2..4. A single number ("4") is the wiki's "up to 4": the maximum is known,
// the minimum is not, so it stays null. Anything else ("", "unknown", "2+") is unknown.
export function parsePlayers(value: string | null): Capacity | null {
  if (!value) return null;
  const range = value.match(/^(\d+)\s*-\s*(\d+)$/);
  if (range) {
    const [min, max] = [Number(range[1]), Number(range[2])];
    return min > 0 && max >= min ? { min, max } : null;
  }
  const single = value.match(/^(\d+)$/);
  if (single) {
    const n = Number(single[1]);
    return n > 0 ? { min: null, max: n } : null;
  }
  return null;
}

// Removes references and wiki markup from a notes field, keeping readable text.
export function cleanNotes(value: string | null): string | null {
  if (!value) return null;
  const text = value
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[\s\S]*?<\/ref>/g, "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text === "" ? null : text;
}

function connection(block: string | null, prefix: string): Connection {
  const unknown: Connection = {
    supported: null,
    players: null,
    coop: null,
    versus: null,
    sharedRange: false,
    coopPlayers: null,
    versusPlayers: null,
    notes: null,
  };
  if (!block) return unknown;
  const supported = parseFlag(field(block, prefix));
  const modes = (field(block, `${prefix} modes`) ?? "").toLowerCase();
  // A listed mode is a yes. A mode that isn't listed is unknown, not a no: the list may be
  // incomplete (Sea of Thieves lists only "Versus", but crews play together).
  const coop = modes.includes("co-op") ? true : null;
  const versus = modes.includes("versus") ? true : null;
  return {
    supported,
    players: supported === true ? parsePlayers(field(block, `${prefix} players`)) : null,
    coop: supported === true ? coop : supported === false ? false : null,
    versus: supported === true ? versus : supported === false ? false : null,
    sharedRange: coop === true && versus === true,
    coopPlayers: null,
    versusPlayers: null,
    notes: cleanNotes(field(block, `${prefix} notes`)),
  };
}

function taxonomy(wikitext: string, name: string): string[] {
  const match = wikitext.match(new RegExp(`\\{\\{Infobox game/row/taxonomy/${name}\\s*\\|([^}]*)\\}\\}`));
  if (!match) return [];
  // The values end where a "| ref=" parameter starts, and capitalisation varies between pages
  // ("puzzle" vs "Puzzle"), so both are normalised before de-duplicating.
  const items = match[1]
    .split("|")[0]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1));
  return [...new Set(items)];
}

type PcgwFacts = {
  steamAppIds: number[];
  singleplayer: boolean | null;
  monetization: "free-to-play" | "paid" | "unknown";
  local: Connection;
  lan: Connection;
  online: Connection;
  crossplayNote: string | null;
  genres: string[];
  themes: string[];
};

export function parsePcgw(wikitext: string): PcgwFacts {
  const block = wikitext.match(/\{\{Network\/Multiplayer[\s\S]*?\n\}\}/)?.[0] ?? null;

  const modes = taxonomy(wikitext, "modes").map((m) => m.toLowerCase());
  const monetization = taxonomy(wikitext, "monetization").map((m) => m.toLowerCase());

  const steamField = wikitext.match(/\|\s*steam appid\s*=([^\n]*)/)?.[1] ?? "";
  const steamAppIds = steamField
    .split(",")
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);

  // Crossplay notes: either a dedicated field, or the online notes when they mention it.
  const crossplay = block ? cleanNotes(field(block, "crossplay notes")) : null;
  const online = connection(block, "online play");
  const crossplayNote =
    crossplay ?? (online.notes && /cross-?play|cross-platform/i.test(online.notes) ? online.notes : null);

  return {
    steamAppIds,
    singleplayer: modes.length === 0 ? null : modes.includes("singleplayer"),
    // Free-to-play only when the wiki says so. A $0 price somewhere is not evidence of this.
    monetization: monetization.includes("free-to-play")
      ? "free-to-play"
      : monetization.includes("one-time game purchase")
        ? "paid"
        : "unknown",
    local: connection(block, "local play"),
    lan: connection(block, "lan play"),
    online,
    crossplayNote,
    genres: taxonomy(wikitext, "genres"),
    themes: taxonomy(wikitext, "themes"),
  };
}
