import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const OLDEN_LABS_BASE_URL = "https://oldenlabs.com:8000";
const OLDEN_LABS_COOKIE = "olden_labs_token";

// Format date to DDMMYYYYHHMM
function formatDateForOldenLabs(date: Date): string {
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear().toString();
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${day}${month}${year}${hours}${minutes}`;
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
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");
  const groupBy = searchParams.get("group_by") || "hour1";

  if (!studyId || !dateFrom || !dateTo) {
    return NextResponse.json(
      { error: "Missing required parameters: study_id, date_from, date_to" },
      { status: 400 }
    );
  }

  // Parse dates and format for Olden Labs API
  const fromDate = new Date(dateFrom);
  const toDate = new Date(dateTo);
  const nowDate = new Date();

  const datetimeFrom = formatDateForOldenLabs(fromDate);
  const datetimeTo = formatDateForOldenLabs(toDate);
  const datetimeNow = formatDateForOldenLabs(nowDate);

  const oldenLabsUrl = `${OLDEN_LABS_BASE_URL}/study-monitoring/get-excel-with-data/${studyId}?datetime_from=${datetimeFrom}&datetime_to=${datetimeTo}&group_by=${groupBy}&datetime_now=${datetimeNow}`;

  try {
    const response = await fetch(oldenLabsUrl, {
      headers: {
        Cookie: `olden_labs=${token.value}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `Olden Labs API error: ${response.status} - ${text}` },
        { status: response.status }
      );
    }

    // Request was successful - file extraction has started on Olden Labs
    return NextResponse.json({
      success: true,
      message: "File extraction started",
      studyId,
      dateRange: { from: datetimeFrom, to: datetimeTo },
      groupBy,
    });
  } catch (error) {
    console.error("Olden Labs API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch data from Olden Labs" },
      { status: 500 }
    );
  }
}
