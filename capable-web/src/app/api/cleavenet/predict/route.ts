import { NextRequest, NextResponse } from "next/server";

const CLEAVENET_URL = process.env.CLEAVENET_URL || "";
const CLEAVENET_API_KEY = process.env.CLEAVENET_API_KEY || "";
const VALID_AAS = new Set("ACDEFGHIKLMNPQRSTVWY");

export async function POST(request: NextRequest) {
  const body = await request.json();
  const raw = (body.sequence || "").replace(/\s/g, "").toUpperCase();

  if (!raw) {
    return NextResponse.json(
      { error: "Missing 'sequence' field" },
      { status: 400 }
    );
  }

  for (const ch of raw) {
    if (!VALID_AAS.has(ch)) {
      return NextResponse.json(
        { error: `Invalid character '${ch}'. Only the 20 natural amino acids are allowed.` },
        { status: 400 }
      );
    }
  }

  if (raw.length < 10) {
    return NextResponse.json(
      { error: "Sequence must be at least 10 residues long." },
      { status: 400 }
    );
  }

  if (!CLEAVENET_URL) {
    return NextResponse.json(
      { error: "CleavNet endpoint not configured" },
      { status: 500 }
    );
  }

  // Build sliding 10-mer windows
  const windows: string[] = [];
  for (let i = 0; i <= raw.length - 10; i++) {
    windows.push(raw.slice(i, i + 10));
  }

  // Format as FASTA
  const fastaLines = windows.map((w, i) => `>pos_${i}\n${w}`).join("\n");

  try {
    const res = await fetch(CLEAVENET_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CLEAVENET_API_KEY}`,
      },
      body: JSON.stringify({ fasta: fastaLines }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `CleavNet error: ${text}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json({
      sequence: raw,
      windows: data.results,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to reach CleavNet: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 502 }
    );
  }
}
