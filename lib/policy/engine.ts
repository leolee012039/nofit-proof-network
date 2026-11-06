import type { KnowledgeSource, ServiceCapability } from "@/db/schema";
import { TOOL_LABELS, type BuyerRequirement, type Operation, type ToolKey } from "@/lib/domain/requirements";
import type { FitStatus } from "@/lib/domain/states";
import { excerptFor, latestVersions, retrieve, type RetrievalResult, type RetrievedSource } from "@/lib/knowledge/retrieval";
import { TEST_CASE_CRM_UPDATE, type ProofSpec } from "@/lib/proofs/types";
import {
  ImplementationLimitations,
  POLICY_VERSION,
  ProofLimitations,
  SupportedTools,
  type Citation,
  type Finding,
  type FindingSeverity,
  type OutcomeEvidence,
  type PolicyResult,
  type ToolCapability,
} from "./types";

/**
 * Deterministic fit policy. Runs BEFORE any language model and is the only
 * component allowed to decide fit_status, hard blockers and the proof offer.
 * Model output can explain these results but can never change them.
 *
 * Rule families run in a fixed order (tools, operations, approval, delivery
 * limits, commercial risks, source conflicts, injection screen, outcome memory);
 * the order also fixes the citation numbering [S1], [S2], ...
 */

export interface PolicyInput {
  requirement: BuyerRequirement;
  implementation: ServiceCapability | null;
  proofOffering: ServiceCapability | null;
  /** Authorized seller knowledge (all versions); untrusted uploads included. */
  sources: KnowledgeSource[];
  /** Authorized, integrity-checked outcome records. Empty for a baseline decision. */
  outcomes: OutcomeEvidence[];
  now: Date;
}

const REMEDIATION_CODES = new Set(["R-CRM-WRITE-SCOPE", "R-HUMAN-APPROVAL-CONFLICT"]);

type Supported = Record<string, ToolCapability>;

class CitationSet {
  readonly items: Citation[] = [];
  private bySource = new Map<string, string>();

  add(c: Omit<Citation, "ref">): string {
    const existing = this.bySource.get(`${c.kind}:${c.sourceId}`);
    if (existing) return existing;
    const ref = `S${this.items.length + 1}`;
    this.items.push({ ...c, ref });
    this.bySource.set(`${c.kind}:${c.sourceId}`, ref);
    return ref;
  }
}

/** One evaluation's working state: findings, citations and the authorized evidence they may cite. */
class Evaluation {
  readonly findings: Finding[] = [];
  readonly assumptions: string[] = [];
  readonly cites = new CitationSet();
  readonly extraReasonCodes: string[] = [];

  constructor(
    readonly input: PolicyInput,
    /** Retrieved sources, authored only: untrusted uploads are never policy evidence. */
    readonly authored: RetrievedSource[],
    /** Every current authored document, retrieved or not: structured policy claims apply seller-wide. */
    readonly currentAuthored: KnowledgeSource[],
  ) {}

  get req() {
    return this.input.requirement;
  }

  add(f: Finding) {
    if (!this.findings.some((x) => x.code === f.code && x.tool === f.tool)) this.findings.push(f);
  }

  citeDoc(docKey: string | undefined, keywords: string[]): string | null {
    if (!docKey) return null;
    const s = this.authored.find((r) => r.source.docKey === docKey)?.source ?? this.currentAuthored.find((x) => x.docKey === docKey);
    if (!s) return null;
    return this.cites.add({
      kind: "knowledge",
      sourceId: s.id,
      docKey: s.docKey,
      title: s.title,
      version: s.version,
      excerpt: excerptFor(s.content, keywords),
      visibility: s.visibility,
      trust: s.trust,
    });
  }

  citeCapability(summary: string): string | null {
    const c = this.input.implementation;
    if (!c) return null;
    return this.cites.add({
      kind: "capability",
      sourceId: c.id,
      title: `${c.displayName} (service capability)`,
      version: c.version,
      excerpt: summary,
      visibility: "buyer_visible",
    });
  }
}

/** The seller's validated structured capability, plus the one-line summary cited as its evidence. */
interface Capability {
  supported: Supported;
  limits: ImplementationLimitations;
  summary: string;
  basePriceMinor: number;
}

const refs = (...r: Array<string | null>): string[] => r.filter((x): x is string => Boolean(x));

function providerTool(op: Operation, req: BuyerRequirement): ToolKey | null {
  if (op === "chat_receive" || op === "chat_send") return "line";
  if (op === "sheet_read" || op === "sheet_append") return "google_sheets";
  const crm = req.tools.find((t) => t.key === "hubspot" || t.key === "salesforce");
  return crm ? crm.key : null;
}

export function evaluatePolicy(input: PolicyInput): PolicyResult {
  const tools = input.implementation ? SupportedTools.safeParse(input.implementation.supportedToolsJson) : null;
  const limits = input.implementation ? ImplementationLimitations.safeParse(input.implementation.limitationsJson) : null;
  const supported = tools?.success ? tools.data : null;

  const retrieval = retrieveEvidence(input, supported, limits?.success ? limits.data : null);
  const ev = new Evaluation(
    input,
    retrieval.retrieved.filter((r) => r.source.trust === "authored"),
    latestVersions(input.sources).current.filter((s) => s.trust === "authored"),
  );

  const cap = requireCapability(ev, supported, limits?.success ? limits.data : null);
  if (cap) {
    checkTools(ev, cap);
    checkOperations(ev, cap);
    checkApprovalPolicy(ev, cap);
    checkDeliveryLimits(ev, cap);
    checkCommercialRisks(ev, cap);
    checkConflictingSources(ev, cap);
  }

  flagInjections(ev, retrieval);
  if (retrieval.superseded.length) ev.extraReasonCodes.push("SUPERSEDED_SOURCES_IGNORED");
  const outcomesConsidered = applyOutcomeMemory(ev, supported);

  const fitStatus = aggregateStatus(ev.findings);
  const proposedProof = buildProofProposal(input, ev.findings, fitStatus, ev.cites);
  const reasonCodes = [...new Set([...ev.findings.map((f) => `${f.code}:${f.severity}`), ...ev.extraReasonCodes])].sort();

  return {
    fitStatus,
    findings: ev.findings,
    citations: ev.cites.items,
    reasonCodes,
    assumptions: ev.assumptions,
    injectionFlags: retrieval.injectionFlags,
    supersededIgnored: retrieval.superseded,
    outcomesConsidered,
    proposedProof,
    policyVersion: POLICY_VERSION,
  };
}

/** The seller's structured capability, or null after recording why no compatibility can be assessed. */
function requireCapability(ev: Evaluation, supported: Supported | null, limits: ImplementationLimitations | null): Capability | null {
  const impl = ev.input.implementation;
  if (!impl) {
    ev.add({
      code: "R-SELLER-NO-CAPABILITY",
      severity: "blocker",
      title: "Seller has no active implementation offering",
      detail: "The selected seller has not published an implementation capability, so no compatibility can be assumed.",
      citationRefs: [],
      remediable: false,
      remediation: "Choose a seller with a documented offering for these tools.",
    });
    return null;
  }
  if (!supported || !limits) {
    ev.add({
      code: "R-CAPABILITY-INVALID",
      severity: "review",
      title: "Seller capability record is malformed",
      detail: "The seller's structured capability could not be validated; a human must review before any decision.",
      citationRefs: [],
      remediable: false,
    });
    return null;
  }
  return capabilityOf(supported, limits, impl.basePriceMinor);
}

/** Retrieval over authorized knowledge; the seller's policy documents for the requested tools are always included. */
function retrieveEvidence(input: PolicyInput, supported: Supported | null, limits: ImplementationLimitations | null): RetrievalResult {
  const req = input.requirement;
  const requiredDocKeys = new Set<string>();
  if (limits) for (const k of Object.values(limits.policyDocKeys)) if (k) requiredDocKeys.add(k);
  if (supported) {
    for (const t of req.tools) {
      const doc = supported[t.key]?.sourceDocKey;
      if (doc) requiredDocKeys.add(doc);
    }
  }
  return retrieve(input.sources, {
    text: `${req.title} ${req.goal} ${req.notes}`,
    tags: [...req.tools.map((t) => t.key), ...req.operations],
    requiredDocKeys: [...requiredDocKeys],
  });
}

function capabilityOf(supported: Supported, L: ImplementationLimitations, basePriceMinor: number): Capability {
  return {
    supported,
    limits: L,
    basePriceMinor,
    summary: `min lead time ${L.minLeadTimeDays} days; data regions: ${L.dataRegions.join(", ")}; human approval for production CRM writes: ${L.productionCrmWritesRequireHumanApproval ? "required" : "not required"}; supported tools: ${Object.keys(supported).join(", ")}`,
  };
}

type RequestedTool = BuyerRequirement["tools"][number];

// ---- Tools, versions, evidence coverage -------------------------------------

function checkTools(ev: Evaluation, cap: Capability) {
  for (const t of ev.req.tools) checkTool(ev, cap, t);
  const L = cap.limits;
  if (ev.req.tools.length > L.maxTools) {
    ev.add({
      code: "R-TOO-MANY-TOOLS",
      severity: "review",
      title: `More than ${L.maxTools} tools in one project`,
      detail: `The seller's policy allows ${L.maxTools} tools per project; ${ev.req.tools.length} were requested.`,
      citationRefs: refs(ev.citeCapability(cap.summary)),
      remediable: false,
    });
  }
}

function checkTool(ev: Evaluation, cap: Capability, t: RequestedTool) {
  const label = TOOL_LABELS[t.key];
  if (t.key === "other") {
    ev.add({
      code: "R-UNLISTED-TOOL",
      severity: "missing",
      tool: t.key,
      title: "Unlisted tool has no seller evidence",
      detail: "An unlisted tool was requested. No seller documentation covers it, so compatibility is not assumed.",
      citationRefs: [],
      remediable: false,
      remediation: "Name the tool and its API so the seller can check documented support.",
    });
    return;
  }
  const toolCap: ToolCapability | undefined = cap.supported[t.key];
  if (!toolCap) {
    ev.add({
      code: "R-UNSUPPORTED-TOOL",
      severity: "blocker",
      tool: t.key,
      title: `${label} is not a documented connector for this seller`,
      detail: `The seller's capability lists ${Object.keys(cap.supported).join(", ")}; ${label} is not among them.`,
      citationRefs: refs(ev.citeCapability(cap.summary)),
      remediable: false,
      remediation: `Choose a seller with a documented ${label} connector, or remove it from scope.`,
    });
    return;
  }
  const docRef = ev.citeDoc(toolCap.sourceDocKey, [t.key, "version", "api", ...(t.apiVersion ? [t.apiVersion] : [])]);
  checkApiVersion(ev, cap, t, toolCap, docRef);
  if (!ev.authored.some((r) => (r.source.tagsJson ?? []).includes(t.key))) {
    ev.add({
      code: "R-NO-EVIDENCE",
      severity: "missing",
      tool: t.key,
      title: `No seller documentation covers ${label}`,
      detail: `The capability lists ${label}, but no current authored knowledge source documents it. Compatibility is not assumed.`,
      citationRefs: [],
      remediable: false,
    });
  }
}

function checkApiVersion(ev: Evaluation, cap: Capability, t: RequestedTool, toolCap: ToolCapability, docRef: string | null) {
  const label = TOOL_LABELS[t.key];
  if (!t.apiVersion) {
    ev.assumptions.push(
      `${label}: API version not stated; the seller's documented version ${toolCap.apiVersions[0]} is assumed and must be confirmed.`,
    );
    return;
  }
  if (toolCap.deprecatedVersions.includes(t.apiVersion)) {
    ev.add({
      code: "R-API-VERSION-EXPIRED",
      severity: "blocker",
      tool: t.key,
      title: `${label} API ${t.apiVersion} is expired for this seller`,
      detail: `The seller treats ${label} ${t.apiVersion} as expired; supported: ${toolCap.apiVersions.join(", ")}.`,
      citationRefs: refs(docRef, ev.citeCapability(cap.summary)),
      remediable: false,
      remediation: `Migrate to ${label} ${toolCap.apiVersions[0]} before re-assessment.`,
    });
  } else if (!toolCap.apiVersions.includes(t.apiVersion)) {
    ev.add({
      code: "R-API-VERSION-UNVERIFIED",
      severity: "missing",
      tool: t.key,
      title: `${label} API ${t.apiVersion} has no seller evidence`,
      detail: `Only ${toolCap.apiVersions.join(", ")} are documented. Compatibility with ${t.apiVersion} is not assumed.`,
      citationRefs: refs(docRef),
      remediable: false,
    });
  }
}

// ---- Operations and permissions (never assume unstated permissions) --------

function checkOperations(ev: Evaluation, cap: Capability) {
  for (const op of ev.req.operations) checkOperation(ev, cap, op);
}

function checkOperation(ev: Evaluation, cap: Capability, op: Operation) {
  const providerKey = providerTool(op, ev.req);
  if (!providerKey) {
    ev.add({
      code: "R-CRM-UNSPECIFIED",
      severity: "missing",
      title: "CRM operation requested without a CRM tool",
      detail: `"${op}" needs a CRM, but no CRM tool was listed.`,
      citationRefs: [],
      remediable: false,
    });
    return;
  }
  const toolReq = ev.req.tools.find((t) => t.key === providerKey);
  if (!toolReq) {
    ev.add({
      code: "R-OPERATION-TOOL-MISSING",
      severity: "missing",
      tool: providerKey,
      title: `${TOOL_LABELS[providerKey]} is needed for "${op}" but not listed`,
      detail: `The operation "${op}" requires ${TOOL_LABELS[providerKey]}, which is not in the tool list.`,
      citationRefs: [],
      remediable: false,
    });
    return;
  }
  const toolCap = cap.supported[providerKey];
  if (!toolCap) return; // already a blocker
  if (!toolCap.operations.includes(op)) {
    ev.add({
      code: "R-UNSUPPORTED-OPERATION",
      severity: "blocker",
      tool: providerKey,
      title: `"${op}" is not supported on ${TOOL_LABELS[providerKey]}`,
      detail: `Documented operations: ${toolCap.operations.join(", ")}.`,
      citationRefs: refs(ev.citeCapability(cap.summary)),
      remediable: false,
    });
    return;
  }
  checkPermissions(ev, cap, op, toolReq, toolCap);
}

function checkPermissions(ev: Evaluation, cap: Capability, op: Operation, toolReq: RequestedTool, toolCap: ToolCapability) {
  const key = toolReq.key;
  const label = TOOL_LABELS[key];
  const required = toolCap.requiredPermissions[op] ?? [];
  if (required.length === 0) return;
  if (toolReq.permissionsStatus === "unknown") {
    ev.add({
      code: "R-PERMISSION-UNKNOWN",
      severity: "missing",
      tool: key,
      title: `Granted ${label} permissions are unknown`,
      detail: `"${op}" needs ${required.join(", ")}. The buyer did not state granted permissions, so none are assumed.`,
      citationRefs: refs(ev.citeDoc(toolCap.sourceDocKey, ["scope", "permission", ...required])),
      remediable: false,
      remediation: `Ask the ${label} administrator which permissions the integration holds.`,
    });
    return;
  }
  const missing = required.filter((p) => !toolReq.grantedPermissions.includes(p));
  if (missing.length === 0) return;
  if (op === "crm_write" && key === "hubspot") {
    ev.add({
      code: "R-CRM-WRITE-SCOPE",
      severity: "blocker",
      tool: key,
      title: "Required CRM write scope is missing",
      detail: `Updating CRM records requires ${missing.join(", ")}. The buyer environment grants only ${toolReq.grantedPermissions.join(", ") || "no scopes"}. The requested scope cannot run unmodified.`,
      citationRefs: refs(
        ev.citeDoc(cap.limits.policyDocKeys.crmWrite, ["contacts.write", "scope", "write", "update"]),
        ev.citeCapability(cap.summary),
      ),
      remediable: true,
      remediation: `The buyer's CRM administrator grants ${missing.join(", ")} to the integration.`,
    });
  } else {
    ev.add({
      code: "R-MISSING-PERMISSION",
      severity: "blocker",
      tool: key,
      title: `${label} permission missing for "${op}"`,
      detail: `"${op}" requires ${missing.join(", ")}, which is not granted.`,
      citationRefs: refs(ev.citeDoc(toolCap.sourceDocKey, ["permission", ...missing])),
      remediable: false,
      remediation: `Grant ${missing.join(", ")} and re-assess.`,
    });
  }
}

// ---- Seller policy and delivery limits ----------------------------------------

/** Production CRM writes need a human approval step when the seller's policy says so. */
function checkApprovalPolicy(ev: Evaluation, cap: Capability) {
  const req = ev.req;
  if (!req.operations.includes("crm_write") || !cap.limits.productionCrmWritesRequireHumanApproval) return;
  const ref = ev.citeDoc(cap.limits.policyDocKeys.crmWrite, ["human approval", "approval", "production"]);
  if (req.compliance.approvalMode === "fully_automatic") {
    ev.add({
      code: "R-HUMAN-APPROVAL-CONFLICT",
      severity: "review",
      title: "Fully automatic CRM writes conflict with seller policy",
      detail:
        "The buyer asked for fully automatic CRM updates; seller policy requires a human approval step before production CRM records change.",
      citationRefs: refs(ref),
      remediable: true,
      remediation: "Accept a human approval step before CRM record changes are committed.",
    });
  } else if (req.compliance.approvalMode === "undecided") {
    ev.add({
      code: "R-APPROVAL-MODE-UNDECIDED",
      severity: "missing",
      title: "Approval mode for CRM writes is undecided",
      detail: "Seller policy requires human approval for production CRM writes. Confirm the buyer accepts this.",
      citationRefs: refs(ref),
      remediable: false,
    });
  }
}

/** Timeline and data residency: hard limits a proof run cannot change. */
function checkDeliveryLimits(ev: Evaluation, cap: Capability) {
  const { req } = ev;
  const L = cap.limits;
  if (req.timelineDays < L.minLeadTimeDays) {
    ev.add({
      code: "R-LEAD-TIME",
      severity: "blocker",
      title: "Timeline is shorter than the seller's minimum lead time",
      detail: `Requested ${req.timelineDays} days; minimum delivery lead time is ${L.minLeadTimeDays} days.`,
      citationRefs: refs(ev.citeDoc(L.policyDocKeys.leadTime, ["lead time", "days", "minimum"]), ev.citeCapability(cap.summary)),
      remediable: false,
      remediation: `Extend the timeline to at least ${L.minLeadTimeDays} days.`,
    });
  }
  if (req.compliance.dataResidency !== "none" && !L.dataRegions.includes(req.compliance.dataResidency)) {
    ev.add({
      code: "R-DATA-RESIDENCY",
      severity: "blocker",
      title: `Data must stay in ${req.compliance.dataResidency.toUpperCase()}; seller processes in ${L.dataRegions.join(", ").toUpperCase()}`,
      detail: "The buyer's residency requirement is not covered by the seller's processing regions.",
      citationRefs: refs(ev.citeDoc(L.policyDocKeys.residency, ["region", "processes", "hosted"]), ev.citeCapability(cap.summary)),
      remediable: false,
      remediation: "Choose a seller that processes data in the required region.",
    });
  }
}

/** Budget and personal data: risks to disclose, never blockers. */
function checkCommercialRisks(ev: Evaluation, cap: Capability) {
  const { req } = ev;
  if (req.budgetMinor < cap.basePriceMinor) {
    ev.add({
      code: "R-BUDGET-BELOW-LIST",
      severity: "risk",
      title: "Budget is below the seller's list price",
      detail: `Budget is below the seller's demo list price for this service.`,
      citationRefs: refs(ev.citeCapability(cap.summary)),
      remediable: false,
    });
  }
  if (req.compliance.containsPii && (req.operations.includes("crm_write") || req.operations.includes("sheet_append"))) {
    ev.add({
      code: "R-PII-PROCESSING",
      severity: "risk",
      title: "Personal data will be written to third-party systems",
      detail: "A data processing agreement is required before implementation. Proof runs use synthetic data only.",
      citationRefs: [],
      remediable: false,
    });
  }
}

/** Conflicting authored sources (all current documents, not only retrieved ones). */
function checkConflictingSources(ev: Evaluation, cap: Capability) {
  const L = cap.limits;
  for (const src of ev.currentAuthored) {
    const claims = (src.claimsJson ?? {}) as Record<string, unknown>;
    const conflicts: string[] = [];
    if (typeof claims.minLeadTimeDays === "number" && claims.minLeadTimeDays !== L.minLeadTimeDays) {
      conflicts.push(`lead time ${claims.minLeadTimeDays} vs ${L.minLeadTimeDays} days`);
    }
    if (Array.isArray(claims.dataRegions) && [...claims.dataRegions].sort().join(",") !== [...L.dataRegions].sort().join(",")) {
      conflicts.push(`regions ${claims.dataRegions.join(",")} vs ${L.dataRegions.join(",")}`);
    }
    if (
      typeof claims.humanApprovalForCrmWrites === "boolean" &&
      claims.humanApprovalForCrmWrites !== L.productionCrmWritesRequireHumanApproval
    ) {
      conflicts.push("human-approval rule differs");
    }
    if (conflicts.length) {
      ev.add({
        code: "R-CONFLICTING-SOURCES",
        severity: "review",
        tool: src.docKey,
        title: `"${src.title}" conflicts with the structured capability`,
        detail: `Conflict: ${conflicts.join("; ")}. A human must decide which source is authoritative.`,
        citationRefs: refs(ev.citeDoc(src.docKey, ["days", "region", "approval"]), ev.citeCapability(cap.summary)),
        remediable: false,
      });
    }
  }
}

// ---- Prompt-injection screen (informational; never changes the decision) ----

function flagInjections(ev: Evaluation, retrieval: RetrievalResult) {
  for (const flag of retrieval.injectionFlags) {
    const src = retrieval.retrieved.find((r) => r.source.id === flag.sourceId)?.source;
    const ref = src
      ? ev.cites.add({
          kind: "knowledge",
          sourceId: src.id,
          docKey: src.docKey,
          title: src.title,
          version: src.version,
          excerpt: flag.snippet,
          visibility: src.visibility,
          trust: src.trust,
        })
      : null;
    ev.add({
      code: "R-INJECTION-IGNORED",
      severity: "info",
      tool: flag.sourceId,
      title: `Instruction-like text in "${flag.title}" was ignored`,
      detail: `Retrieved documents are treated as data only. Patterns detected: ${flag.patterns.join(", ")}. The text had no effect on status, price or approvals.`,
      citationRefs: ref ? [ref] : [],
      remediable: false,
    });
  }
}

// ---- Outcome memory: verified remediation evidence ---------------------------

/** Why an outcome record can (or cannot) be used as evidence for this request. */
function outcomeUsability(o: OutcomeEvidence, expectedHubVersion: string | undefined, now: Date): string {
  if (o.integrity !== "valid") return "evidence digest mismatch";
  if (o.consent === "revoked") return "reuse consent revoked by the buyer";
  if (o.consent === "missing") return "no reuse consent on record";
  if (o.expiresAt.getTime() <= now.getTime()) return "expired evidence";
  if (!o.toolKeys.includes("hubspot") || !o.operations.includes("crm_write")) return "not relevant to requested operations";
  if (expectedHubVersion && o.testedVersions.hubspot !== expectedHubVersion) {
    return `version mismatch (tested ${o.testedVersions.hubspot ?? "unknown"}, requested ${expectedHubVersion})`;
  }
  return "usable";
}

function applyOutcomeMemory(ev: Evaluation, supported: Supported | null): PolicyResult["outcomesConsidered"] {
  const hubReq = ev.req.tools.find((t) => t.key === "hubspot");
  const expectedHubVersion = hubReq?.apiVersion ?? supported?.hubspot?.apiVersions[0];
  const considered: PolicyResult["outcomesConsidered"] = [];
  const usablePass: OutcomeEvidence[] = [];
  const usableFail: OutcomeEvidence[] = [];
  for (const o of ev.input.outcomes) {
    const reason = outcomeUsability(o, expectedHubVersion, ev.input.now);
    const usable = reason === "usable";
    considered.push({ id: o.id, usable, reason });
    if (!usable) continue;
    if (o.result === "PASS" && o.grantedPermissions.includes("contacts.write") && o.conditions.approvalWorkflow === true)
      usablePass.push(o);
    if (o.result === "FAIL" && o.failureClass === "INSUFFICIENT_PERMISSION") usableFail.push(o);
  }
  if (considered.some((o) => !o.usable)) ev.extraReasonCodes.push("STALE_OR_IRRELEVANT_OUTCOMES_EXCLUDED");
  applyRemediationEvidence(ev, usablePass, usableFail);
  return considered;
}

/** A usable PASS under the remediated conditions turns remediable findings into conditions; a FAIL only corroborates. */
function applyRemediationEvidence(ev: Evaluation, usablePass: OutcomeEvidence[], usableFail: OutcomeEvidence[]) {
  const citeOutcome = (o: OutcomeEvidence) =>
    ev.cites.add({
      kind: "outcome",
      sourceId: o.id,
      title: `Outcome ${o.id} — ${o.result}${o.failureClass ? ` (${o.failureClass})` : ""} · run ${o.proofRunId}`,
      version: o.environmentVersion,
      excerpt: `${o.result} with scopes [${o.grantedPermissions.join(", ")}], approval workflow ${o.conditions.approvalWorkflow ? "on" : "off"}, HubSpot ${o.testedVersions.hubspot ?? "?"} (simulated). Evidence sha256:${o.artifactDigest.slice(0, 16)}…`,
      visibility: "buyer_visible",
    });

  for (const f of ev.findings) {
    if (!REMEDIATION_CODES.has(f.code)) continue;
    if (f.code === "R-CRM-WRITE-SCOPE") for (const o of usableFail) f.citationRefs.push(citeOutcome(o));
    if (usablePass.length) {
      f.originalSeverity = f.severity;
      f.severity = "condition";
      f.verifiedByOutcomeIds = usablePass.map((o) => o.id);
      f.citationRefs.push(...usablePass.map(citeOutcome));
      f.detail = `${f.detail} Verified remediation: outcome ${usablePass.map((o) => o.id).join(", ")} passed with this condition met (simulated environment).`;
    }
  }
  // Only while the blocker still stands: once a PASS has turned it into a condition, the FAIL is history, not corroboration.
  if (usableFail.length && ev.findings.some((f) => f.code === "R-CRM-WRITE-SCOPE" && f.severity === "blocker"))
    ev.extraReasonCodes.push("BLOCKER_CORROBORATED_BY_OUTCOME");
  if (usablePass.length && ev.findings.some((f) => f.verifiedByOutcomeIds?.length))
    ev.extraReasonCodes.push("REMEDIATION_VERIFIED_BY_OUTCOME");
}

// ---- Aggregate and proof offer -----------------------------------------------

/** The most severe finding decides: blocker > missing > review > condition > FIT. */
function aggregateStatus(findings: Finding[]): FitStatus {
  const has = (s: FindingSeverity) => findings.some((f) => f.severity === s);
  if (has("blocker")) return "NO_FIT";
  if (has("missing")) return "INSUFFICIENT_INFORMATION";
  if (has("review")) return "NEEDS_REVIEW";
  if (has("condition")) return "CONDITIONAL_FIT";
  return "FIT";
}

/** A bounded proof is offered only when every gating finding is remediable and one of them is the CRM remediation. */
function buildProofProposal(input: PolicyInput, findings: Finding[], fitStatus: FitStatus, cites: CitationSet): ProofSpec | null {
  const offer = input.proofOffering;
  if (!offer || !input.implementation) return null;
  if (fitStatus !== "NO_FIT" && fitStatus !== "NEEDS_REVIEW") return null;
  const gating = findings.filter((f) => f.severity === "blocker" || f.severity === "review" || f.severity === "missing");
  if (gating.length === 0 || gating.some((f) => !f.remediable)) return null;
  if (!gating.some((f) => REMEDIATION_CODES.has(f.code))) return null;
  const limits = ProofLimitations.safeParse(offer.limitationsJson);
  const tools = SupportedTools.safeParse(input.implementation.supportedToolsJson);
  if (!limits.success || !tools.success || !limits.data.testCases.includes(TEST_CASE_CRM_UPDATE)) return null;
  if (offer.currency !== "USD") return null;

  const hub = input.requirement.tools.find((t) => t.key === "hubspot");
  if (!hub) return null;
  const apiVersion = hub.apiVersion ?? tools.data.hubspot?.apiVersions[0] ?? "v3";
  const policyDoc = (ImplementationLimitations.safeParse(input.implementation.limitationsJson).data?.policyDocKeys ?? {}).proofOffering;
  if (policyDoc) {
    const src = input.sources.find((s) => s.docKey === policyDoc && s.status === "current" && s.trust === "authored");
    if (src) {
      cites.add({
        kind: "knowledge",
        sourceId: src.id,
        docKey: src.docKey,
        title: src.title,
        version: src.version,
        excerpt: excerptFor(src.content, ["fixed", "price", "bounded", "feasibility"]),
        visibility: src.visibility,
        trust: src.trust,
      });
    }
  }
  return crmUpdateProof({ offer, limits: limits.data, apiVersion, hub, approvalMode: input.requirement.compliance.approvalMode });
}

function crmUpdateProof(a: {
  offer: ServiceCapability;
  limits: ProofLimitations;
  apiVersion: string;
  hub: RequestedTool;
  approvalMode: BuyerRequirement["compliance"]["approvalMode"];
}): ProofSpec {
  return {
    title: "Bounded feasibility proof: HubSpot contact update behind a human-approval gate",
    hypothesis: `With the contacts.write scope granted and a human-approval gate enabled, a LINE-triggered update to a synthetic HubSpot contact can be committed in a simulated HubSpot CRM ${a.apiVersion} environment without bypassing approval.`,
    testCase: TEST_CASE_CRM_UPDATE,
    steps: [
      `Validate the connector manifest against simulated HubSpot CRM ${a.apiVersion}.`,
      "Check granted OAuth scopes: contacts.read (lookup) and contacts.write (update).",
      "Dry-run a lifecycle-stage update on synthetic contact SYN-C-0042.",
      "Verify the update is held for human approval, then approved by the designated approver.",
      "Verify the committed change and the audit-trail entry.",
    ],
    passCriteria: [
      "The synthetic contact update is committed only after an explicit approval event.",
      "No write is attempted without contacts.write.",
      "An audit entry links the change, the approver and the run ID.",
    ],
    failCriteria: [
      "Any write is rejected for missing scope (PERMISSION_DENIED).",
      "Any write is committed without an approval event.",
      "The audit entry is missing or does not match the change.",
    ],
    limitations: [
      "Runs in a deterministic SIMULATED HubSpot environment; the buyer's real HubSpot account is never accessed.",
      "LINE and Google Sheets steps are represented by fixtures; their production behaviour is not tested.",
      "Does not test production rate limits, data volumes or network failures.",
      "A pass shows feasibility under the tested conditions only; it is not a guarantee for other versions or configurations.",
      "Payment pays for the bounded test; it is not escrow and does not depend on the result.",
    ],
    deliverables: [
      "Evidence report with SHA-256 artifact digest and input fixture hash",
      "Timestamped, sanitized run logs",
      "Outcome record (tested versions, permissions, limits, pass/fail class)",
    ],
    initialEnvironment: {
      envVersion: "env-1",
      hubspot: {
        apiVersion: a.apiVersion,
        grantedScopes: a.hub.permissionsStatus === "stated" ? a.hub.grantedPermissions.filter((p) => p.startsWith("contacts.")) : [],
      },
      approvalWorkflow: { enabled: a.approvalMode === "human_in_loop" },
      dataset: "synthetic-contacts-v1",
    },
    priceMinor: a.offer.basePriceMinor,
    currency: "USD",
    maxRuns: a.limits.maxRuns,
    evidenceTtlDays: a.limits.evidenceTtlDays,
    capabilityId: a.offer.id,
    capabilityVersion: a.offer.version,
  };
}
