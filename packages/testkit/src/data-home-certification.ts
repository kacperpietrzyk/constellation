import assert from "node:assert/strict";

import type { DataHomeProvider } from "@constellation/application";
import {
  DataHomeStatusSchema,
  type DataHomeCapabilityName,
  type DataHomeProviderId,
} from "@constellation/contracts";

export interface DataHomeCertificationExpectation {
  readonly providerId: DataHomeProviderId;
  readonly providerKind: "local_only" | "coordinated";
  readonly storageRole: "canonical" | "projection_with_outbox";
  readonly supportedCapabilities: readonly DataHomeCapabilityName[];
}

const stableStatusFacts = (
  status: Awaited<ReturnType<DataHomeProvider["getStatus"]>>,
) => ({
  descriptor: status.descriptor,
  availability: status.availability,
  syncState: status.syncState,
  quota: status.quota,
  recoveryActions: status.recoveryActions,
  detailCode: status.detailCode,
});

/**
 * Shared minimum certification for local and future coordinated Data Homes.
 * Provider-specific suites add real portability/change-feed failure injection.
 */
export const certifyDataHomeProvider = async (
  provider: DataHomeProvider,
  expectation: DataHomeCertificationExpectation,
): Promise<void> => {
  const first = DataHomeStatusSchema.parse(await provider.getStatus());
  const second = DataHomeStatusSchema.parse(await provider.getStatus());
  assert.deepEqual(
    stableStatusFacts(second),
    stableStatusFacts(first),
    "Data Home identity and capability facts must be stable across probes.",
  );
  assert.equal(first.descriptor.providerId, expectation.providerId);
  assert.equal(first.descriptor.providerKind, expectation.providerKind);
  assert.equal(first.descriptor.storageRole, expectation.storageRole);

  const supported = Object.entries(first.descriptor.capabilities)
    .filter(([, value]) => value.support === "supported")
    .map(([name]) => name)
    .sort();
  assert.deepEqual(supported, [...expectation.supportedCapabilities].sort());

  if (first.descriptor.providerKind === "local_only") {
    assert.equal(first.descriptor.storageRole, "canonical");
    assert.equal(first.descriptor.location, "this_device");
    assert.equal(first.syncState, "not_configured");
    assert.equal(
      first.descriptor.capabilities.device_revocation.support,
      "unsupported",
    );
  }

  provider.cancelProviderMigration("00000000-0000-4000-8000-000000000000");
  const afterCancellation = DataHomeStatusSchema.parse(
    await provider.getStatus(),
  );
  assert.deepEqual(
    stableStatusFacts(afterCancellation),
    stableStatusFacts(first),
    "Cancelling an unknown migration must not mutate provider state.",
  );
};
