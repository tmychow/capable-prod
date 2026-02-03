from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware

from api.database import get_supabase
from api.auth import get_current_user
from api.schemas import (
    ExperimentCreate,
    ExperimentUpdate,
    ExperimentResponse,
    UserSignUp,
    UserLogin,
    AuthResponse,
)

app = FastAPI(
    title="Axonic API",
    description="Axonic Server API",
    version="0.1.0",
)

origins = ["http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
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
        "parameters": experiment.parameters,
        "logs": experiment.logs,
        "peptides": experiment.peptides,
        "experiment_start": (
            str(experiment.experiment_start)
            if experiment.experiment_start
            else None
        ),
        "experiment_end": (
            str(experiment.experiment_end)
            if experiment.experiment_end
            else None
        ),
        "links": experiment.links,
        "olden_labs_study_id": experiment.olden_labs_study_id,
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
    if experiment.parameters is not None:
        data["parameters"] = experiment.parameters
    if experiment.logs is not None:
        data["logs"] = experiment.logs
    if experiment.peptides is not None:
        data["peptides"] = experiment.peptides
    if experiment.experiment_start is not None:
        data["experiment_start"] = str(experiment.experiment_start)
    if experiment.experiment_end is not None:
        data["experiment_end"] = str(experiment.experiment_end)
    if experiment.links is not None:
        data["links"] = experiment.links
    if experiment.olden_labs_study_id is not None:
        data["olden_labs_study_id"] = experiment.olden_labs_study_id

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
