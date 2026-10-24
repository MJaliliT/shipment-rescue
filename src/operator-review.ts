export type Disposition = "unreviewed" | "ready_for_handoff" | "needs_followup";
export type OperatorReview = {
  disposition: Disposition;
  note: string;
  reviewedAt: string | null;
};

export function validateOperatorReview(value: unknown): OperatorReview {
  if (!value || typeof value !== "object") throw new Error("Invalid review");
  const row = value as Record<string, unknown>;
  if (
    !["unreviewed", "ready_for_handoff", "needs_followup"].includes(
      String(row.disposition),
    )
  )
    throw new Error("Invalid disposition");
  if (typeof row.note !== "string" || row.note.length > 2000)
    throw new Error("Review note must contain at most 2000 characters");
  if (
    row.reviewedAt !== null &&
    (typeof row.reviewedAt !== "string" ||
      !Number.isFinite(Date.parse(row.reviewedAt)))
  )
    throw new Error("Invalid review timestamp");
  if (
    row.disposition !== "unreviewed" &&
    (row.reviewedAt === null || !row.note.trim())
  )
    throw new Error("A reviewed case requires a timestamp and handoff note");
  return {
    disposition: row.disposition as Disposition,
    note: row.note,
    reviewedAt: row.reviewedAt as string | null,
  };
}

export function buildReviewPacket(
  context: any,
  reviews: Record<string, unknown>,
  exportedAt: string,
) {
  if (!Number.isFinite(Date.parse(exportedAt)))
    throw new Error("Invalid export timestamp");
  return {
    schemaVersion: 1,
    snapshotId: context.snapshotId,
    asOf: context.asOf,
    synthetic: context.synthetic,
    exportedAt,
    scope:
      "Human review record. No inventory reservation, carrier change or message delivery.",
    cases: context.cases.map((item: any) => ({
      ...item,
      review: validateOperatorReview(
        (Object.hasOwn(reviews, item.orderId)
          ? reviews[item.orderId]
          : undefined) ?? {
          disposition: "unreviewed",
          note: "",
          reviewedAt: null,
        },
      ),
    })),
  };
}
