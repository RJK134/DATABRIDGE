export { Dynamics365EduAdapter, SUPPORTED_RESOURCES } from "./adapter.js";
export type { SupportedResource, Dynamics365EduAdapterOptions } from "./adapter.js";
export { DataverseClient } from "./http.js";
export type {
  DataverseClientOptions,
  FetchLike,
  ODataPage,
  EntityDefinition,
  AttributeMetadata,
} from "./http.js";
export { Dynamics365EduConfigSchema, type Dynamics365EduConfig } from "./config.js";
export {
  RESOURCE_TO_SET,
  RESOURCE_TO_LOGICAL,
  RESOURCE_TO_PK,
  RESOURCE_TO_SELECT,
  isSupportedResource,
} from "./resource-map.js";
export { describeToDictionary, buildDictionary, mapAttributeType } from "./dictionary.js";
