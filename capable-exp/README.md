# capable-exp

**Overview**
`capable-exp`is our ML pipeline. You provide a config (or use the default), run `run.py`, and all outputs land in a per-run folder under `capable-exp/runs/`. The goal is a reproducible, resumable flow with sensible defaults, clear manual handoffs, and backwards compatibility.

**Flow**
The flow of the pipeline is as follows:
1. Prepare: this includes any modification to our dataset that is specific to the experiment
2. Generate: this samples peptides from our Modal + Codex scaffold, doing the ablations we want to test
3. Judge: this takes the peptides and judges them using automated systems or our human judge outputs
4. Analyse: this analyses our judging scores to produce data analysis

When the run starts, the config is read, the run directory `capable-exp/runs/<run_id>/` is created, and the config is copied to `capable-exp/runs/<run_id>/config.yaml`. As each stage is completed, the `run.yaml` file is updated to reflect the status of the stage, and the results are written to `capable-exp/runs/<run_id>/`. This allows the pipeline to be resumed from any stage, and to be reproduced later.

**Considerations**
Since we are building the plane as we fly it, we should have deep backwards compatibility i.e. if we change the pipeline, we should be able to reproduce the results of the previous run. Changes can include adding new stages, new models, new datasets, new ablations, new judges, new analysers, etc.

One particular area where we will make changes frequently is data. Right now, we manually download data from Notion, Olden Labs, Excel sheets, and more. In the future, we will have a data pipeline that populates our data lake automatically in `../capable-data/`. We will need to make sure to pass this to a Modal volume, such that we can grab slices of it for each run. We will also want to do longitudinal data analysis for whether we are making progress on our goals.

Another is tooling. For observability, we will want to be able to read the actual Codex rollouts and see the tool calls / decisions it made to come to the suggestions. For convenience, we will want to include a judging interface for humans in our web app.

A final one is post-training. Right now, the model is invariant, but in the future, we will likely have enough data to post-train both language and science models. I suspect this will be in a different subfolder, but we will need to make sure we can call that model within `capable-exp/`.