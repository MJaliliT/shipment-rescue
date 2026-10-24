import type { Dataset, EvidenceReader } from "./engine.ts";
/** Explicit synthetic refresh fixtures. No new observation is invented at runtime. */
export function fixtureReader(
  data: Dataset & { updates?: Record<string, any[]> },
): EvidenceReader {
  return async (task) =>
    structuredClone(
      task.mode === "refresh" &&
        data.updates &&
        Object.hasOwn(data.updates, task.source)
        ? data.updates[task.source]
        : data[task.source],
    );
}
