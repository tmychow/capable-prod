import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "@/lib/session";
import { getExperiments } from "@/lib/api";

const OLDEN_LABS_BASE_URL = "https://oldenlabs.com:8000";
const OLDEN_LABS_COOKIE = "olden_labs_token";
const FETCH_TIMEOUT_MS = 30000; // 30 seconds

function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

interface OldenLabsGroup {
  id: number;
  name: string;
  code: string;
  number_of_cages: number | null;
  number_of_mice: number | null;
  treatment: string | null;
  species: string | null;
  strain: string | null;
  date_of_birth: string | null;
  sex: string | null;
}

interface OldenLabsCage {
  code: string;
  device_uid: string | null;
}

interface OldenLabsCageGroup {
  id: number;
  cage_list: OldenLabsCage[];
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

  const studyId = request.nextUrl.searchParams.get("study_id");
  const excludeExperimentId = request.nextUrl.searchParams.get("exclude_experiment_id");

  if (!studyId) {
    return NextResponse.json(
      { error: "Missing required parameter: study_id" },
      { status: 400 }
    );
  }

  // Check if an experiment with this study ID already exists
  const session = await getServerSession();
  if (session) {
    try {
      const experiments = await getExperiments(session.accessToken);
      const existing = experiments.find(
        (exp) =>
          exp.olden_labs_study_id?.toString() === studyId &&
          exp.id !== excludeExperimentId
      );
      if (existing) {
        return NextResponse.json(
          {
            error: `An experiment with Olden Labs Study ID ${studyId} already exists: "${existing.name}"`,
            existing_experiment_id: existing.id,
          },
          { status: 409 }
        );
      }
    } catch {
      // If we can't check, continue with sync anyway
    }
  }

  const headers = {
    Cookie: `olden_labs=${token.value}`,
  };

  try {
    const [studyRes, cagesRes] = await Promise.all([
      fetchWithTimeout(`${OLDEN_LABS_BASE_URL}/study-monitoring/${studyId}/with-group-list`, { headers }),
      fetchWithTimeout(`${OLDEN_LABS_BASE_URL}/study-monitoring/ol-group-list-with-cages-by-study-id/${studyId}`, { headers }),
    ]);

    if (!studyRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch study data: ${studyRes.status}` },
        { status: studyRes.status }
      );
    }

    if (!cagesRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch cage data: ${cagesRes.status}` },
        { status: cagesRes.status }
      );
    }

    const studyData = await studyRes.json();
    const cagesData: OldenLabsCageGroup[] = await cagesRes.json();

    // Build a map of group id -> cage codes
    const cagesByGroupId = new Map<number, string[]>();
    for (const group of cagesData) {
      cagesByGroupId.set(
        group.id,
        (group.cage_list || []).filter((c: OldenLabsCage) => c.device_uid).map((c: OldenLabsCage) => c.device_uid as string)
      );
    }

    // Fall back to cages endpoint when groupList is empty
    const groupList: OldenLabsGroup[] = (studyData.groupList as OldenLabsGroup[])?.length
      ? studyData.groupList
      : cagesData;
    // Map Olden Labs groups to our ExperimentGroup format
    const groups = groupList.map((g) => ({
      name: g.name || "",
      group_id: String(g.id),
      group_name: g.code || "",
      num_cages: g.number_of_cages,
      num_animals: g.number_of_mice,
      cage_ids: cagesByGroupId.get(g.id) || [],
      treatment: g.treatment || "",
      species: g.species || "",
      strain: g.strain || "",
      dob: g.date_of_birth || "",
      sex: g.sex || "",
    }));

    // Use create_date as experiment start (format for datetime-local: "2026-02-04T23:01")
    const createDate: string = studyData.study?.create_date || "";
    // datetime-local inputs expect "YYYY-MM-DDTHH:MM" (no seconds)
    const experimentStart = createDate ? createDate.slice(0, 16) : "";

    return NextResponse.json({
      name: studyData.study?.name || "",
      description: studyData.study?.description || "",
      experiment_start: experimentStart,
      organism_type: "Mice",
      groups,
    });
  } catch (error) {
    console.error("Olden Labs sync error:", error);
    const isTimeout = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      { error: isTimeout ? "Connection to Olden Labs timed out" : "Failed to fetch data from Olden Labs" },
      { status: isTimeout ? 504 : 500 }
    );
  }
}
