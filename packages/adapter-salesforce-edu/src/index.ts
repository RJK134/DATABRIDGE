export { SalesforceEduAdapter, SUPPORTED_RESOURCES } from "./adapter.js";
export type { SupportedResource, SalesforceEduAdapterOptions } from "./adapter.js";
export { SalesforceClient } from "./http.js";
export type { SalesforceClientOptions, FetchLike, SoqlResponse, DescribeResponse } from "./http.js";
export { SalesforceEduConfigSchema, type SalesforceEduConfig } from "./config.js";
export {
  RESOURCE_TO_SOBJECT,
  RESOURCE_TO_PK,
  RESOURCE_TO_SELECT,
  isSupportedResource,
} from "./resource-map.js";
export { describeToDictionary, buildDictionary, mapFieldType } from "./dictionary.js";
