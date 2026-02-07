import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const OLDEN_LABS_BASE_URL = "https://oldenlabs.com:8000";
const OLDEN_LABS_COOKIE = "olden_labs_token";

// Ensure timestamp has seconds (e.g. "2026-02-05T20:55" -> "2026-02-05T20:55:00")
function ensureSeconds(timestamp: string): string {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(timestamp)) {
    return `${timestamp}:00`;
  }
  return timestamp;
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(OLDEN_LABS_COOKIE);

  if (!token) {
    return NextResponse.json(
      { error: "Not authenticated with Olden Labs" },
      { status: 401 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const studyId = searchParams.get("study_id");
  const startTime = searchParams.get("start_time");
  const endTime = searchParams.get("end_time");
  const groupBy = searchParams.get("group_by") || "hour1";
  const chartType = searchParams.get("chart_type") || "LineChart";
  const errorBarType = searchParams.get("error_bar_type") || "SEM";

  if (!studyId || !startTime || !endTime) {
    return NextResponse.json(
      { error: "Missing required parameters: study_id, start_time, end_time" },
      { status: 400 }
    );
  }

  const url =
    `${OLDEN_LABS_BASE_URL}/chart/get-all-chart-data-study/` +
    `?chart_id=1` +
    `&start_time=${ensureSeconds(startTime)}` +
    `&end_time=${ensureSeconds(endTime)}` +
    `&filter_value=${studyId}` +
    `&filter_by=study` +
    `&group_by=${groupBy}` +
    `&group_id=${studyId}` +
    `&study_id=${studyId}` +
    `&chart_type=${chartType}` +
    `&error_bar_type=${errorBarType}`;

  console.log("[chart] Fetching:", url);

  try {
    const response = await fetch(url, {
      headers: {
        Cookie: `olden_labs=${token.value}`,
      },
    });

    const text = await response.text();
    console.log("[chart] Response status:", response.status, "body length:", text.length);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Olden Labs API error: ${response.status} - ${text.slice(0, 500)}` },
        { status: response.status }
      );
    }

    // Try to parse as JSON
    try {
      const data = JSON.parse(text);
      return NextResponse.json(data);
    } catch {
      return NextResponse.json(
        { error: `Olden Labs returned non-JSON response: ${text.slice(0, 500)}` },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error("[chart] Fetch error:", error);
    return NextResponse.json(
      { error: `Failed to fetch chart data: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
