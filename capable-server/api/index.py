import os

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware

from api.database import get_supabase
from api.auth import get_current_user
from api.schemas import (
    ExperimentCreate,
    ExperimentUpdate,
    ExperimentResponse,
    PeptideCreate,
    PeptideUpdate,
    UserSignUp,
    UserLogin,
    AuthResponse,
    ensure_utc,
)
from api.cron import run_pickup_cron, run_sync_studies_cron
from api.peptides import run_sync_peptides_cron

app = FastAPI(
    title="Axonic API",
    description="Axonic Server API",
    version="0.1.0",
)

all_vercel_previews = r"https://.*\.vercel\.app"
localhost = r"http://localhost(:\d+)?"

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=f"({all_vercel_previews}|{localhost})",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "Welcome to Capable API"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


# --- Auth ---


@app.post("/auth/login", response_model=AuthResponse)
async def login(user: UserLogin):
    supabase = get_supabase()
    try:
        response = supabase.auth.sign_in_with_password(
            {
                "email": user.email,
                "password": user.password,
            }
        )
        if not response.user:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        return AuthResponse(
            access_token=response.session.access_token,
            user_id=str(response.user.id),
            email=response.user.email,
        )
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))


@app.post("/auth/logout")
async def logout(user=Depends(get_current_user)):
    supabase = get_supabase()
    try:
        supabase.auth.sign_out()
        return {"message": "Logged out successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/auth/me")
async def get_me(user=Depends(get_current_user)):
    return {
        "id": str(user.id),
        "email": user.email,
    }


# --- Experiments (protected) ---


@app.post("/experiments", response_model=ExperimentResponse)
async def create_experiment(
    experiment: ExperimentCreate,
    user=Depends(get_current_user),
):
    supabase = get_supabase()
    data = {
        "name": experiment.name,
        "description": experiment.description,
        "organism_type": experiment.organism_type,
        "groups": experiment.groups,
        "additional_parameters": experiment.additional_parameters,
        "logs": experiment.logs,
        "peptides": experiment.peptides,
        "experiment_start": (
            ensure_utc(experiment.experiment_start).isoformat()
            if experiment.experiment_start
            else None
        ),
        "experiment_end": (
            ensure_utc(experiment.experiment_end).isoformat()
            if experiment.experiment_end
            else None
        ),
        "links": experiment.links,
        "olden_labs_study_id": experiment.olden_labs_study_id,
        "generated_links": experiment.generated_links,
    }
    data = {k: v for k, v in data.items() if v is not None}
    result = supabase.table("experiments").insert(data).execute()
    if not result.data:
        raise HTTPException(
            status_code=500, detail="Failed to create experiment"
        )
    return result.data[0]


@app.get("/experiments", response_model=list[ExperimentResponse])
async def get_experiments(user=Depends(get_current_user)):
    supabase = get_supabase()
    result = supabase.table("experiments").select("*").execute()
    return result.data


@app.get("/experiments/{experiment_id}", response_model=ExperimentResponse)
async def get_experiment(experiment_id: str, user=Depends(get_current_user)):
    supabase = get_supabase()
    result = (
        supabase.table("experiments")
        .select("*")
        .eq("id", experiment_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return result.data[0]


@app.put("/experiments/{experiment_id}", response_model=ExperimentResponse)
async def update_experiment(
    experiment_id: str,
    experiment: ExperimentUpdate,
    user=Depends(get_current_user),
):
    supabase = get_supabase()
    data = {}
    if experiment.name is not None:
        data["name"] = experiment.name
    if experiment.description is not None:
        data["description"] = experiment.description
    if experiment.organism_type is not None:
        data["organism_type"] = experiment.organism_type
    if experiment.groups is not None:
        data["groups"] = experiment.groups
    if experiment.additional_parameters is not None:
        data["additional_parameters"] = experiment.additional_parameters
    if experiment.logs is not None:
        data["logs"] = experiment.logs
    if experiment.peptides is not None:
        data["peptides"] = experiment.peptides
    if experiment.experiment_start is not None:
        data["experiment_start"] = ensure_utc(
            experiment.experiment_start
        ).isoformat()
    if experiment.experiment_end is not None:
        data["experiment_end"] = ensure_utc(
            experiment.experiment_end
        ).isoformat()
    if experiment.links is not None:
        data["links"] = experiment.links
    if experiment.olden_labs_study_id is not None:
        data["olden_labs_study_id"] = experiment.olden_labs_study_id
    if experiment.generated_links is not None:
        data["generated_links"] = experiment.generated_links

    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = (
        supabase.table("experiments")
        .update(data)
        .eq("id", experiment_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return result.data[0]


@app.delete("/experiments/{experiment_id}")
async def delete_experiment(experiment_id: str, user=Depends(get_current_user)):
    supabase = get_supabase()
    result = (
        supabase.table("experiments").delete().eq("id", experiment_id).execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return {"message": "Experiment deleted"}


# --- Peptides (protected) ---


@app.get("/peptides")
async def get_peptides(user=Depends(get_current_user)):
    supabase = get_supabase()
    result = supabase.table("peptides").select("*").execute()
    return result.data


@app.post("/peptides")
async def create_peptide(
    peptide: PeptideCreate,
    user=Depends(get_current_user),
):
    supabase = get_supabase()

    # Validate experiment IDs and build experiments list
    experiments = []
    not_found = []
    for exp_id in peptide.experiment_ids:
        result = (
            supabase.table("experiments")
            .select("id, name")
            .eq("id", exp_id)
            .execute()
        )
        if not result.data:
            not_found.append(exp_id)
        else:
            exp = result.data[0]
            experiments.append({exp["name"]: str(exp["id"])})

    if not_found:
        raise HTTPException(
            status_code=404,
            detail=f"Experiments not found: {', '.join(not_found)}",
        )

    # Check for duplicate peptide name
    existing = (
        supabase.table("peptides")
        .select("id")
        .eq("name", peptide.name)
        .execute()
    )
    if existing.data:
        raise HTTPException(
            status_code=409,
            detail=f"Peptide '{peptide.name}' already exists",
        )

    result = (
        supabase.table("peptides")
        .insert(
            {
                "name": peptide.name,
                "sequence": peptide.sequence,
                "experiments": experiments,
            }
        )
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create peptide")
    return result.data[0]


@app.put("/peptides/{peptide_id}")
async def update_peptide(
    peptide_id: int,
    peptide: PeptideUpdate,
    user=Depends(get_current_user),
):
    supabase = get_supabase()
    data = {}

    if peptide.name is not None:
        # Check for duplicate name (excluding this peptide)
        existing = (
            supabase.table("peptides")
            .select("id")
            .eq("name", peptide.name)
            .neq("id", peptide_id)
            .execute()
        )
        if existing.data:
            raise HTTPException(
                status_code=409,
                detail=f"Peptide '{peptide.name}' already exists",
            )
        data["name"] = peptide.name

    if peptide.sequence is not None:
        data["sequence"] = peptide.sequence

    if peptide.experiment_ids is not None:
        experiments = []
        not_found = []
        for exp_id in peptide.experiment_ids:
            result = (
                supabase.table("experiments")
                .select("id, name")
                .eq("id", exp_id)
                .execute()
            )
            if not result.data:
                not_found.append(exp_id)
            else:
                exp = result.data[0]
                experiments.append({exp["name"]: str(exp["id"])})
        if not_found:
            raise HTTPException(
                status_code=404,
                detail=f"Experiments not found: {', '.join(not_found)}",
            )
        data["experiments"] = experiments

    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = (
        supabase.table("peptides").update(data).eq("id", peptide_id).execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Peptide not found")
    return result.data[0]


@app.delete("/peptides/{peptide_id}")
async def delete_peptide(peptide_id: int, user=Depends(get_current_user)):
    supabase = get_supabase()
    result = supabase.table("peptides").delete().eq("id", peptide_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Peptide not found")
    return {"message": "Peptide deleted"}


# --- Cron ---


@app.get("/cron/pickup-files")
async def cron_pickup_files(request: Request):
    # Verify Vercel cron secret
    cron_secret = os.getenv("CRON_SECRET", "")
    auth_header = request.headers.get("authorization", "")
    if cron_secret and auth_header != f"Bearer {cron_secret}":
        raise HTTPException(status_code=401, detail="Unauthorized")
    return await run_pickup_cron()


@app.get("/cron/sync-studies")
async def cron_sync_studies(request: Request):
    # Verify Vercel cron secret
    cron_secret = os.getenv("CRON_SECRET", "")
    auth_header = request.headers.get("authorization", "")
    if cron_secret and auth_header != f"Bearer {cron_secret}":
        raise HTTPException(status_code=401, detail="Unauthorized")
    return await run_sync_studies_cron()


@app.get("/cron/sync-peptides")
async def cron_sync_peptides(request: Request, limit: int | None = None):
    # Verify Vercel cron secret
    cron_secret = os.getenv("CRON_SECRET", "")
    auth_header = request.headers.get("authorization", "")
    if cron_secret and auth_header != f"Bearer {cron_secret}":
        raise HTTPException(status_code=401, detail="Unauthorized")
    return await run_sync_peptides_cron(limit=limit)
