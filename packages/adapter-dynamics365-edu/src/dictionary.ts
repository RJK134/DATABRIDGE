/**
 * Build a canonical DictionaryEntry[] from a Dataverse EntityDefinitions
 * payload.
 */
import type { DictionaryEntry } from "@databridge/adapter-spec";
import type { DataverseClient, EntityDefinition } from "./http.js";
import { RESOURCE_TO_LOGICAL, type SupportedResource } from "./resource-map.js";

export function mapAttributeType(t: string | undefined): string {
  switch (t) {
    case "String":
    case "Memo":
    case "EntityName":
      return "string";
    case "Uniqueidentifier":
      return "string";
    case "Lookup":
    case "Owner":
    case "Customer":
      return "reference";
    case "Integer":
    case "BigInt":
      return "integer";
    case "Decimal":
    case "Double":
    case "Money":
      return "decimal";
    case "Boolean":
      return "boolean";
    case "DateTime":
      return "datetime";
    case "Picklist":
    case "Status":
    case "State":
      return "codelist";
    default:
      return t ?? "string";
  }
}

export function describeToDictionary(
  resource: SupportedResource,
  def: EntityDefinition
): DictionaryEntry[] {
  return def.Attributes.map((a) => {
    const entry: DictionaryEntry = {
      entityCode: resource,
      fieldCode: a.LogicalName,
      businessName: a.DisplayName?.UserLocalizedLabel?.Label ?? a.LogicalName,
      dataType: mapAttributeType(a.AttributeType),
      isMandatory:
        a.RequiredLevel?.Value === "ApplicationRequired" ||
        a.RequiredLevel?.Value === "SystemRequired",
    };
    if (a.Targets && a.Targets.length > 0) {
      entry.linkedEntity = a.Targets.join(",");
    }
    return entry;
  });
}

export async function buildDictionary(
  client: DataverseClient,
  resources: readonly SupportedResource[],
  cache: Map<string, EntityDefinition>
): Promise<DictionaryEntry[]> {
  const out: DictionaryEntry[] = [];
  for (const r of resources) {
    const logical = RESOURCE_TO_LOGICAL[r];
    let def = cache.get(logical);
    if (!def) {
      def = await client.describe(logical);
      cache.set(logical, def);
    }
    out.push(...describeToDictionary(r, def));
  }
  return out;
}
