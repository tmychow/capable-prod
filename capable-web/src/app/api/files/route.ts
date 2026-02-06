import { NextRequest, NextResponse } from "next/server";

const MODAL_DOWNLOAD_URL = process.env.MODAL_DOWNLOAD_URL || "";
const MODAL_STORAGE_KEY = process.env.MODAL_STORAGE_KEY || "";

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");

  if (!path) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  if (!MODAL_DOWNLOAD_URL || !MODAL_STORAGE_KEY) {
    return NextResponse.json(
      { error: "Storage not configured" },
      { status: 500 }
    );
  }

  const res = await fetch(
    `${MODAL_DOWNLOAD_URL}?path=${encodeURIComponent(path)}`,
    {
      headers: {
        Authorization: `Bearer ${MODAL_STORAGE_KEY}`,
      },
    }
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: "File not found" },
      { status: res.status }
    );
  }

  const filename = path.split("/").pop() || "download";
  const blob = await res.blob();

  return new NextResponse(blob, {
    headers: {
      "Content-Type":
        res.headers.get("content-type") || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
