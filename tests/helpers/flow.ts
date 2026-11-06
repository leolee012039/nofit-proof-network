import { ORG } from "@/lib/demo/fixtures";
import { demoRequirement } from "@/lib/domain/requirements";
import { acceptContract, approveContract } from "@/lib/services/contracts";
import { createBuyerRequest } from "@/lib/services/requests";
import { actors } from "./db";

export const OFFLINE = { aiMode: { kind: "offline-fixture" as const, reason: "test" } };

/** Demo request → NO_FIT → proposed contract → seller approved → buyer accepted. */
export async function acceptedContract() {
  const a = await actors();
  const r = await createBuyerRequest(a.buyer, demoRequirement(ORG.lumen), OFFLINE);
  if (!r.contract) throw new Error("expected a proof proposal");
  const approved = await approveContract(a.seller, r.contract.id, { scopeHash: r.contract.scopeHash });
  const accepted = await acceptContract(a.buyer, approved.id, { scopeHash: approved.scopeHash, acknowledge: true });
  return { ...a, request: r.request, assessment: r.assessment, contract: accepted };
}
