import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export type DocType = "quotation" | "invoice" | "transfer";

const PREFIX: Record<DocType, string> = {
  quotation: "QTN",
  invoice: "INV",
  transfer: "TRF",
};

/**
 * Generate the next sequential document number for the given type, e.g.
 * `QTN-2026-000001` / `INV-2026-000001`. The counter resets each calendar year.
 *
 * Uses an atomic INSERT ... ON CONFLICT DO UPDATE against document_sequences so
 * concurrent creates can never receive the same number.
 */
export async function nextDocumentNumber(docType: DocType, when: Date = new Date()): Promise<string> {
  const year = when.getFullYear();
  const result = await db.execute(sql`
    INSERT INTO document_sequences (doc_type, year, last_number)
    VALUES (${docType}, ${year}, 1)
    ON CONFLICT (doc_type, year)
    DO UPDATE SET last_number = document_sequences.last_number + 1
    RETURNING last_number
  `);
  const rows = (result as unknown as { rows?: Array<{ last_number: number }> }).rows
    ?? (result as unknown as Array<{ last_number: number }>);
  const seq = Number(rows[0].last_number);
  return `${PREFIX[docType]}-${year}-${String(seq).padStart(6, "0")}`;
}
