import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import {
  MARKER_CATALOG,
  ReportExtractionResponseSchema,
  resolveCanonicalMarkerName,
  type ReportExtractionResponse,
} from "@gymflow/shared";
import { PDFParse } from "pdf-parse";
import { GrokClient } from "../ai/grok-client.service";

const MAX_TEXT_CHARS = 25_000;
const MIN_TEXT_CHARS = 40;

export interface ExtractionResult {
  rawText: string;
  collectedAt: string | null;
  labName: string | null;
  markers: Array<{
    rawLabel: string;
    canonicalName: string | null;
    label: string;
    value: number | null;
    unit: string | null;
    refLow: number | null;
    refHigh: number | null;
    recognised: boolean;
  }>;
}

/**
 * Turns a raw PDF buffer into a preview of recognisable markers.
 * Step 1: pdf-parse pulls the text layer.
 * Step 2: Grok is asked to structure the text into marker rows.
 * Step 3: we map each row to our canonical catalog + decorate with label.
 * The caller shows this preview to the user for edit/confirm; nothing is
 * persisted at this stage.
 */
@Injectable()
export class PdfExtractor {
  private readonly logger = new Logger(PdfExtractor.name);

  constructor(private readonly grok: GrokClient) {}

  async extract(buffer: Buffer): Promise<ExtractionResult> {
    const rawText = await this.parseText(buffer);
    const structured = await this.askGrok(rawText);

    const markers = structured.markers.map((m) => {
      const canonical =
        resolveCanonicalMarkerName(m.canonicalName ?? "") ??
        resolveCanonicalMarkerName(m.rawLabel);
      const def = canonical
        ? MARKER_CATALOG.find((x) => x.canonicalName === canonical)
        : undefined;
      return {
        rawLabel: m.rawLabel,
        canonicalName: canonical,
        label: def?.label ?? m.rawLabel,
        value: m.value,
        unit: m.unit ?? def?.unit ?? "",
        refLow: m.refLow ?? def?.refLow ?? null,
        refHigh: m.refHigh ?? def?.refHigh ?? null,
        recognised: Boolean(canonical),
      };
    });

    return {
      rawText,
      collectedAt: structured.collectedAt,
      labName: structured.labName,
      markers,
    };
  }

  private async parseText(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    let rawText: string;
    try {
      const result = await parser.getText();
      rawText = result.text ?? "";
    } catch (err) {
      this.logger.warn(`pdf-parse failed: ${(err as Error).message}`);
      throw new BadRequestException({
        error: "pdf_unreadable",
        message: "Could not read the PDF. Is it a valid file?",
      });
    } finally {
      await parser.destroy().catch(() => undefined);
    }
    const text = rawText.trim();
    if (text.length < MIN_TEXT_CHARS) {
      throw new BadRequestException({
        error: "pdf_no_text_layer",
        message:
          "This PDF looks image-only (scanned). Please upload a text PDF or enter values manually.",
      });
    }
    return text.length > MAX_TEXT_CHARS
      ? text.slice(0, MAX_TEXT_CHARS)
      : text;
  }

  private async askGrok(rawText: string): Promise<ReportExtractionResponse> {
    const catalogHint = MARKER_CATALOG.map(
      (m) => `${m.canonicalName} (${m.label}, ${m.unit})`,
    ).join(", ");

    const system = [
      "You extract blood test markers from a lab report.",
      "Return STRICT JSON matching this TypeScript type:",
      "{ collectedAt: string | null, labName: string | null, markers: { rawLabel: string, canonicalName: string | null, value: number | null, unit: string | null, refLow: number | null, refHigh: number | null }[] }",
      "Rules:",
      "- Use only values you can see in the text; use null for anything missing.",
      "- `canonicalName` must be one of the catalog names or null if you are unsure.",
      "- Do not invent markers. Do not include commentary. JSON only.",
      "- `collectedAt` must be ISO-8601 if present.",
      `Catalog: ${catalogHint}`,
    ].join("\n");

    const user = `LAB REPORT TEXT:\n\n${rawText}`;

    const res = await this.grok.chat({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      responseFormat: "json",
      temperature: 0,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(res.content);
    } catch (err) {
      this.logger.error(`grok returned non-JSON: ${res.content.slice(0, 500)}`);
      throw new BadRequestException({
        error: "extraction_parse_failed",
        message: "Could not parse extracted markers.",
      });
    }

    const result = ReportExtractionResponseSchema.safeParse(parsed);
    if (!result.success) {
      this.logger.error(
        `grok extraction failed schema: ${JSON.stringify(result.error.issues).slice(0, 800)}`,
      );
      throw new BadRequestException({
        error: "extraction_schema_mismatch",
        message: "Extraction returned an unexpected shape.",
      });
    }
    return result.data;
  }
}
