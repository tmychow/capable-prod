import os

import modal
from fastapi import Header
from fastapi.responses import JSONResponse

app = modal.App("cleavenet")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("tensorflow==2.15.*", "numpy", "h5py", "fastapi[standard]")
    .add_local_dir("weights", remote_path="/app/weights")
    .add_local_file("models.py", remote_path="/app/models.py")
    .add_local_file("utils.py", remote_path="/app/utils.py")
)

# --- FASTA parsing ---

def parse_fasta(fasta_string: str) -> list[dict]:
    """Parse a FASTA-formatted string into a list of {header, sequence} dicts.

    Handles both single and multi-sequence FASTA. If the input has no '>'
    header lines, treats the entire string as a single raw sequence.
    """
    lines = fasta_string.strip().splitlines()
    entries = []
    current_header = None
    current_seq_parts = []

    for line in lines:
        line = line.strip()
        if not line:
            continue
        if line.startswith(">"):
            if current_header is not None or current_seq_parts:
                entries.append({
                    "header": current_header or "",
                    "sequence": "".join(current_seq_parts),
                })
            current_header = line[1:].strip()
            current_seq_parts = []
        else:
            current_seq_parts.append(line.upper())

    # Last entry
    if current_header is not None or current_seq_parts:
        entries.append({
            "header": current_header or "",
            "sequence": "".join(current_seq_parts),
        })

    return entries


# --- Inference endpoint ---

@app.cls(image=image, gpu=None, secrets=[modal.Secret.from_name("cleavenet-api-key")])
class CleavNetPredictor:
    @modal.enter()
    def load_models(self):
        """Pre-load all 5 ensemble models at container startup."""
        import sys
        sys.path.insert(0, "/app")

        import os
        os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

        from models import _build_predictor

        self.ensemble = []
        for i in range(5):
            checkpoint = f"/app/weights/transformer_{i}/model.h5"
            model = _build_predictor(checkpoint)
            self.ensemble.append(model)

    @modal.fastapi_endpoint(method="POST")
    def predict(self, body: dict, authorization: str = Header(default="")):
        # Check API key
        token = authorization.removeprefix("Bearer ").strip()
        if token != os.environ.get("CLEAVENET_API_KEY", ""):
            return JSONResponse({"error": "Unauthorized"}, status_code=401)

        import numpy as np
        import sys
        sys.path.insert(0, "/app")
        from models import _tokenize, mmps

        fasta_str = body.get("fasta", "")
        if not fasta_str:
            return {"error": "Missing 'fasta' field in request body"}

        entries = parse_fasta(fasta_str)
        if not entries:
            return {"error": "No sequences found in FASTA input"}

        sequences = [e["sequence"] for e in entries]

        # Validate: only standard amino acids + pad char
        valid_aas = set("ACDEFGHIKLMNPQRSTVWY")
        for seq in sequences:
            invalid = set(seq) - valid_aas
            if invalid:
                return {"error": f"Invalid characters in sequence '{seq}': {invalid}"}

        x = _tokenize(sequences)

        # Run ensemble
        predictions = []
        for model in self.ensemble:
            y_hat = model(x, training=False)
            predictions.append(y_hat.numpy())

        predictions = np.stack(predictions)  # (5, num_seq, 18)
        means = np.mean(predictions, axis=0)  # (num_seq, 18)
        stds = np.std(predictions, axis=0)    # (num_seq, 18)

        results = []
        for idx, entry in enumerate(entries):
            scores = {mmp: round(float(means[idx, i]), 4) for i, mmp in enumerate(mmps)}
            uncertainties = {mmp: round(float(stds[idx, i]), 4) for i, mmp in enumerate(mmps)}
            results.append({
                "header": entry["header"],
                "sequence": entry["sequence"],
                "scores": scores,
                "uncertainties": uncertainties,
            })

        return {"results": results}
