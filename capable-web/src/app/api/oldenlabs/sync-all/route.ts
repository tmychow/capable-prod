import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "@/lib/session";
import { getExperiments, createExperiment } from "@/lib/api";

const OLDEN_LABS_BASE_URL = "https://oldenlabs.com:8000";
const OLDEN_LABS_COOKIE = "olden_labs_token";
const FETCH_TIMEOUT_MS = 30000; // 30 seconds

function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

interface OldenLabsStudy {
  id: number;
  name: string;
  description: string | null;
  create_date: string | null;
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

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(OLDEN_LABS_COOKIE);

  if (!token) {
    return NextResponse.json(
      { error: "Not authenticated with Olden Labs" },
      { status: 401 }
    );
  }

  const session = await getServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  const oldenHeaders = {
    Cookie: `olden_labs=${token.value}`,
  };

  try {
    // Fetch all studies from Olden Labs
    const studiesRes = await fetchWithTimeout(`${OLDEN_LABS_BASE_URL}/study-monitoring/ol-study-list`, {
      headers: oldenHeaders,
    });

    if (!studiesRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch studies: ${studiesRes.status}` },
        { status: studiesRes.status }
      );
    }

    const oldenStudies: OldenLabsStudy[] = await studiesRes.json();

    // Get existing experiments to find which study IDs are already imported
    const existingExperiments = await getExperiments(session.accessToken);
    const existingStudyIds = new Set(
      existingExperiments
        .map((exp) => exp.olden_labs_study_id)
        .filter((id): id is number => id !== null)
    );

    // Filter to studies that don't exist yet
    const newStudies = oldenStudies.filter((study) => !existingStudyIds.has(study.id));

    if (newStudies.length === 0) {
      return NextResponse.json({
        created: 0,
        message: "All Olden Labs studies are already synced",
      });
    }

    // Create experiments for each new study
    const created: string[] = [];
    const errors: string[] = [];

    for (const study of newStudies) {
      try {
        // Fetch groups and cages for this study
        const [studyDetailRes, cagesRes] = await Promise.all([
          fetchWithTimeout(`${OLDEN_LABS_BASE_URL}/study-monitoring/${study.id}/with-group-list`, {
            headers: oldenHeaders,
          }),
          fetchWithTimeout(`${OLDEN_LABS_BASE_URL}/study-monitoring/ol-group-list-with-cages-by-study-id/${study.id}`, {
            headers: oldenHeaders,
          }),
        ]);

        let groups = null;
        if (studyDetailRes.ok && cagesRes.ok) {
          const studyData = await studyDetailRes.json();
          const cagesData: OldenLabsCageGroup[] = await cagesRes.json();

          // Build cage map
          const cagesByGroupId = new Map<number, string[]>();
          for (const group of cagesData) {
            cagesByGroupId.set(
              group.id,
              (group.cage_list || [])
                .filter((c: OldenLabsCage) => c.device_uid)
                .map((c: OldenLabsCage) => c.device_uid as string)
            );
          }

          // Map groups
          groups = (studyData.groupList as OldenLabsGroup[] || []).map((g) => ({
            name: g.name || "",
            group_id: g.code || "",
            num_cages: g.number_of_cages,
            num_animals: g.number_of_mice,
            cage_ids: cagesByGroupId.get(g.id) || [],
            treatment: g.treatment || "",
            species: g.species || "",
            strain: g.strain || "",
            dob: g.date_of_birth || "",
            sex: g.sex || "",
          }));
        }

        // Format experiment_start
        const experimentStart = study.create_date ? study.create_date.slice(0, 16) : null;

        // Create the experiment
        await createExperiment(
          {
            name: study.name || `Study ${study.id}`,
            description: study.description,
            experiment_start: experimentStart,
            organism_type: "Mice",
            groups: groups && groups.length > 0 ? groups : null,
            olden_labs_study_id: String(study.id),
          },
          session.accessToken
        );

        created.push(study.name || `Study ${study.id}`);
      } catch (err) {
        errors.push(`Failed to create "${study.name}": ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    return NextResponse.json({
      created: created.length,
      created_names: created,
      errors: errors.length > 0 ? errors : undefined,
      message: `Created ${created.length} new experiment${created.length === 1 ? "" : "s"}`,
    });
  } catch (error) {
    console.error("Olden Labs sync-all error:", error);
    const isTimeout = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      { error: isTimeout ? "Connection to Olden Labs timed out" : "Failed to sync from Olden Labs" },
      { status: isTimeout ? 504 : 500 }
    );
  }
}
