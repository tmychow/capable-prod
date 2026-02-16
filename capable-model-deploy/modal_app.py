import os

import modal
from fastapi import Header
from fastapi.responses import JSONResponse

app = modal.App("cleavenet")

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "torch",
        "torch-geometric",
        "rdkit",
        "numpy",
        "fastapi[standard]",
    )
    .add_local_file("weights/combined.pt", remote_path="/app/weights/combined.pt")
    .add_local_file("models.py", remote_path="/app/models.py")
)


@app.cls(image=image, gpu=None, secrets=[modal.Secret.from_name("cleavenet-api-key")])
class CleavNetPredictor:
    @modal.enter()
    def load_models(self):
        """Load the combined GNN model at container startup."""
        import sys
        sys.path.insert(0, "/app")
        from models import load_combined_model
        self.model, self.protease_codes = load_combined_model("/app/weights/combined.pt")

    @modal.fastapi_endpoint(method="POST")
    def predict(self, body: dict, authorization: str = Header(default="")):
        token = authorization.removeprefix("Bearer ").strip()
        if token != os.environ.get("CLEAVENET_API_KEY", ""):
            return JSONResponse({"error": "Unauthorized"}, status_code=401)

        import sys
        sys.path.insert(0, "/app")
        from models import predict_all_proteases

        sequence = (body.get("sequence") or "").strip().upper()
        if not sequence:
            return {"error": "Missing 'sequence' field in request body"}

        valid_aas = set("ACDEFGHIKLMNPQRSTVWY")
        invalid = set(sequence) - valid_aas
        if invalid:
            return {"error": f"Invalid characters in sequence: {sorted(invalid)}"}

        if len(sequence) < 2:
            return {"error": "Sequence must be at least 2 residues long"}

        if len(sequence) > 200:
            return {"error": "Sequence must be at most 200 residues long"}

        try:
            bonds = predict_all_proteases(self.model, sequence, self.protease_codes)
        except Exception as e:
            return JSONResponse(
                {"error": f"Prediction failed: {str(e)}"}, status_code=500
            )

        return {
            "sequence": sequence,
            "proteases": self.protease_codes,
            "bonds": bonds,
        }
