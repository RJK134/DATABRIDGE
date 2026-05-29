/**
 * Dictionary helpers: derive a canonical DictionaryEntry[] from the
 * SObject describe payload. Cached at the adapter level.
 */
import type { DictionaryEntry } from "@databridge/adapter-spec";
import type { DescribeResponse, SalesforceClient } from "./http.js";
import { RESOURCE_TO_SOBJECT, type SupportedResource } from "./resource-map.js";

/** Map a Salesforce field type to a dictionary "dataType" string. */
export function mapFieldType(sfType: string): string {
  switch (sfType) {
    case "string":
    case "textarea":
    case "url":
    case "phone":
    case "email":
    case "id":
    case "reference":
      return "string";
    case "double":
    case "currency":
    case "percent":
      return "decimal";
    case "int":
      return "integer";
    case "boolean":
      return "boolean";
    case "date":
      return "date";
    case "datetime":
      return "datetime";
    case "picklist":
    case "multipicklist":
      return "codelist";
    default:
      return sfType;
  }
}

/** Convert a single describe payload to dictionary entries. */
export function describeToDictionary(
  resource: SupportedResource,
  describe: DescribeResponse
): DictionaryEntry[] {
  return describe.fields.map((f) => {
    const entry: DictionaryEntry = {
      entityCode: resource,
      fieldCode: f.name,
      businessName: f.label ?? f.name,
      dataType: mapFieldType(f.type),
      isMandatory: f.nillable === false,
    };
    if (f.referenceTo && f.referenceTo.length > 0) {
      entry.linkedEntity = f.referenceTo.join(",");
    }
    return entry;
  });
}

/**
 * Build the full dictionary across all supported resources.
 *
 * Uses an in-memory cache keyed by SObject name to avoid re-issuing
 * describe calls when the dictionary is requested repeatedly within a
 * single adapter lifetime.
 */
export async function buildDictionary(
  client: SalesforceClient,
  resources: readonly SupportedResource[],
  cache: Map<string, DescribeResponse>
): Promise<DictionaryEntry[]> {
  const out: DictionaryEntry[] = [];
  for (const r of resources) {
    const sObject = RESOURCE_TO_SOBJECT[r];
    let describe = cache.get(sObject);
    if (!describe) {
      describe = await client.describe(sObject);
      cache.set(sObject, describe);
    }
    out.push(...describeToDictionary(r, describe));
  }
  return out;
}
