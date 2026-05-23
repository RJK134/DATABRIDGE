import type { DhpComputeInput, DhpMetrics, DhpSnapshot } from './types';
import { computeDhp } from './compute';
import { randomUUID } from 'crypto';

export interface SnapshotStore {
  save(snapshot: DhpSnapshot): Promise<void>;
  getLatest(tenantId: string, profileId: string): Promise<DhpSnapshot | null>;
}

export class DhpSnapshotWorker {
  constructor(private readonly store: SnapshotStore) {}

  async run(input: DhpComputeInput): Promise<DhpSnapshot> {
    const metrics: DhpMetrics = computeDhp(input);
    const previous = await this.store.getLatest(input.tenantId, input.profileId);

    const snapshot: DhpSnapshot = {
      id: randomUUID(),
      tenantId: input.tenantId,
      profileId: input.profileId,
      snapshotAt: metrics.computedAt,
      metrics,
    };

    if (previous) {
      const prevScore = previous.metrics.overallScore;
      snapshot.delta = {
        previousSnapshotId: previous.id,
        overallScoreDelta: parseFloat((metrics.overallScore - prevScore).toFixed(4)),
        entityDeltas: metrics.entities.map((e) => {
          const prevEntity = previous.metrics.entities.find((pe) => pe.entity === e.entity);
          return {
            entity: e.entity,
            scoreDelta: parseFloat((e.overallScore - (prevEntity?.overallScore ?? 0)).toFixed(4)),
          };
        }),
      };
    }

    await this.store.save(snapshot);
    return snapshot;
  }
}
