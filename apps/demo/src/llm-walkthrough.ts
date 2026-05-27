/**
 * 5-prompt scripted NL → rule → findings walkthrough used by the demo
 * orchestrator and the docs/DEMO_SCRIPT.md Phase B section.
 *
 * Each prompt is wired through the DeterministicMockProvider so the
 * demo works without paid LLM access. The canned LLM response is the
 * grammar-validated LlmRule that the deterministic compiler then
 * validates against the dictionary and dry-runs against the bound
 * fixture rows.
 *
 * Production runs (a real provider configured via env vars) follow the
 * same code path — the only thing that changes is which provider gets
 * selected by selectProviderFromEnv().
 */
import {
  compileNlToRule,
  DeterministicMockProvider,
  selectProviderFromEnv,
  type LlmProvider,
} from "@databridge/rule-compiler-llm";
import { narrate } from "@databridge/findings-narrative-llm";
import type { LlmCallProvenance } from "@databridge/provenance-core";
import type { AuditFinding } from "@databridge/rule-core";

/** A single scripted prompt + its fixture binding. */
export interface ScriptedPrompt {
  /** Stable id used in JSON output. */
  id: string;
  /** Fixture this prompt is intended for (matches DemoFixture.name). */
  fixture: string;
  /** Natural-language input the presenter types. */
  nl: string;
  /** Canned LLM response — mirrors the regression corpus. */
  expectedRule: Record<string, unknown>;
}

export const SCRIPTED_PROMPTS: readonly ScriptedPrompt[] = [
  {
    id: "demo-01",
    fixture: "salesforce-edu-westmidlands",
    nl: "contacts with the placeholder shared email",
    expectedRule: {
      id: "contacts-shared-email",
      entity: "Contact",
      name: "Contacts with shared placeholder email",
      description: "Salesforce Contacts whose Email is the shared placeholder.",
      severity: "ERROR",
      tags: ["crm", "identity"],
      messageTemplate: "Contact {{Id}} has shared placeholder email",
      where: {
        kind: "predicate",
        op: "eq",
        field: { kind: "field", entity: "Contact", field: "Email" },
        operands: [{ kind: "literal", value: "shared.contact@uni.example" }],
      },
    },
  },
  {
    id: "demo-02",
    fixture: "salesforce-edu-westmidlands",
    nl: "contacts with FERPA withheld but not opted out of email",
    expectedRule: {
      id: "contacts-ferpa-mismatch",
      entity: "Contact",
      name: "FERPA withheld but not opted out",
      description: "Salesforce Contacts whose hed__FERPA__c is Withheld but HasOptedOutOfEmail is false.",
      severity: "ERROR",
      tags: ["crm", "privacy"],
      messageTemplate: "Contact {{Id}} has FERPA Withheld but is not opted out",
      where: {
        kind: "and",
        clauses: [
          {
            kind: "predicate",
            op: "eq",
            field: { kind: "field", entity: "Contact", field: "hed__FERPA__c" },
            operands: [{ kind: "literal", value: "Withheld" }],
          },
          {
            kind: "predicate",
            op: "eq",
            field: { kind: "field", entity: "Contact", field: "HasOptedOutOfEmail" },
            operands: [{ kind: "literal", value: false }],
          },
        ],
      },
    },
  },
  {
    id: "demo-03",
    fixture: "banner-r2t-2024",
    nl: "banner students whose major code is XX_LEGACY",
    expectedRule: {
      id: "banner-major-legacy",
      entity: "BannerStudent",
      name: "Banner students on legacy XX_LEGACY major",
      description: "Banner students whose SGBSTDN_MAJR_CODE_1 is XX_LEGACY.",
      severity: "WARN",
      tags: ["banner", "codeset-drift"],
      messageTemplate: "Banner student {{SPRIDEN_PIDM}} has legacy major XX_LEGACY",
      where: {
        kind: "predicate",
        op: "eq",
        field: { kind: "field", entity: "BannerStudent", field: "SGBSTDN_MAJR_CODE_1" },
        operands: [{ kind: "literal", value: "XX_LEGACY" }],
      },
    },
  },
  {
    id: "demo-04",
    fixture: "sits-southcoast-2024",
    nl: "sits students whose husid is null",
    expectedRule: {
      id: "sits-missing-husid",
      entity: "SitsStudent",
      name: "SITS students missing STU_HUSID",
      description: "SITS students whose STU_HUSID is null.",
      severity: "WARN",
      tags: ["sits", "identity"],
      messageTemplate: "SITS student {{STU_CODE}} is missing STU_HUSID",
      where: {
        kind: "predicate",
        op: "isNull",
        field: { kind: "field", entity: "SitsStudent", field: "STU_HUSID" },
        operands: [],
      },
    },
  },
  {
    id: "demo-05",
    fixture: "dynamics365-edu-northpennines",
    nl: "dataverse contacts with donotbulkemail true",
    expectedRule: {
      id: "dataverse-bulk-optout",
      entity: "DataverseContact",
      name: "Dataverse contacts opted out of bulk email",
      description: "Dataverse contact rows with donotbulkemail = true.",
      severity: "INFO",
      tags: ["crm", "privacy"],
      messageTemplate: "Contact {{contactid}} is opted out of bulk email",
      where: {
        kind: "predicate",
        op: "eq",
        field: { kind: "field", entity: "DataverseContact", field: "donotbulkemail" },
        operands: [{ kind: "literal", value: true }],
      },
    },
  },
];

/** Per-prompt outcome surfaced by the orchestrator. */
export interface ScriptedPromptResult {
  id: string;
  nl: string;
  fixture: string;
  ruleId: string;
  entity: string;
  severity: string;
  rowsScanned: number;
  findings: number;
  provider: string;
  model: string;
  promptHashPrefix: string;
  responseHashPrefix: string;
  latencyMs: number;
  costUsd?: number;
}

export interface WalkthroughInput {
  /** Fixture rows keyed by fixture name. */
  fixturesByName: Record<string, ReadonlyArray<Record<string, unknown>>>;
  /** Optional explicit provider — defaults to selectProviderFromEnv. */
  provider?: LlmProvider;
}

export interface WalkthroughResult {
  prompts: ScriptedPromptResult[];
  /** Narrative built over the union of synthesised findings. */
  narrative?: {
    headline: string;
    actionsCount: number;
    provenance: LlmCallProvenance | null;
  };
}

/**
 * Run the full 5-prompt walkthrough. The provider falls back to the
 * deterministic mock seeded with the scripted prompts so the demo
 * always works.
 */
export async function runLlmWalkthrough(input: WalkthroughInput): Promise<WalkthroughResult> {
  const provider =
    input.provider ??
    selectProviderFromEnv(process.env, {
      entries: SCRIPTED_PROMPTS.map((p) => ({ match: p.nl, response: p.expectedRule })),
    });

  const prompts: ScriptedPromptResult[] = [];
  const syntheticFindings: AuditFinding[] = [];

  for (const p of SCRIPTED_PROMPTS) {
    const rows = input.fixturesByName[p.fixture] ?? [];
    const result = await compileNlToRule(p.nl, {
      provider,
      dataset: rows,
    });
    const r: ScriptedPromptResult = {
      id: p.id,
      nl: p.nl,
      fixture: p.fixture,
      ruleId: result.rule.id,
      entity: result.rule.entity,
      severity: result.rule.severity,
      rowsScanned: rows.length,
      findings: result.dryRunFindings ?? 0,
      provider: result.provenance.provider,
      model: result.provenance.model,
      promptHashPrefix: result.provenance.promptHash.slice(0, 12),
      responseHashPrefix: result.provenance.responseHash.slice(0, 12),
      latencyMs: result.provenance.latencyMs,
    };
    if (result.provenance.costUsd !== undefined) r.costUsd = result.provenance.costUsd;
    prompts.push(r);

    // Synthesise findings for the narrative — one per row that the rule
    // flagged. The narrator never sees the raw row values, only the
    // rule id + severity + entity.
    for (let i = 0; i < (result.dryRunFindings ?? 0); i += 1) {
      syntheticFindings.push({
        id: `${p.id}-${i}`,
        tenantId: "demo",
        ruleId: result.rule.id,
        ruleName: result.rule.name,
        severity: result.rule.severity as AuditFinding["severity"],
        entityType: result.rule.entity,
        subjectId: `${p.fixture}-row-${i}`,
        message: result.rule.messageTemplate,
        evidence: {},
        status: "open",
        detectedAt: new Date().toISOString(),
      });
    }
  }

  let narrative: WalkthroughResult["narrative"] | undefined;
  try {
    const narrativeProvider = input.provider ?? buildNarrativeMock();
    const n = await narrate(syntheticFindings, { provider: narrativeProvider });
    narrative = {
      headline: n.slots.headline_sentence,
      actionsCount: n.slots.recommended_next_actions.length,
      provenance: n.provenance,
    };
  } catch {
    // Narrative is best-effort: a missing canned response (real provider
    // not configured + no mock entry) shouldn't fail the walkthrough.
    narrative = undefined;
  }

  const out: WalkthroughResult = { prompts };
  if (narrative !== undefined) out.narrative = narrative;
  return out;
}

/** Deterministic mock seeded with a generic narrative so the demo
 *  always produces a non-empty summary. */
function buildNarrativeMock(): DeterministicMockProvider {
  return new DeterministicMockProvider({
    defaultResponse: {
      headline_sentence:
        "Five demo prompts surfaced findings across CRM, SITS, Banner and Dataverse fixtures.",
      severity_breakdown_bullets: [
        "ERROR findings concentrated on CRM consent and identity surfaces.",
        "WARN findings clustered around codeset drift and missing HUSIDs.",
        "INFO findings highlighted opt-out trends in Dataverse.",
      ],
      top_cluster_root_cause:
        "The dominant cluster is consent mismatch in the Salesforce Contact entity, driven by a stale marketing list left in place after the FERPA flag was raised.",
      recommended_next_actions: [
        { owner: "Registry", action: "Resolve the SITS HUSID gaps before the next HESA submission.", priority: 1 },
        { owner: "CRM admin", action: "Reconcile FERPA flags with marketing-list membership.", priority: 1 },
        { owner: "Banner admin", action: "Retire the XX_LEGACY major and update STVMAJR.", priority: 2 },
      ],
    },
  });
}
