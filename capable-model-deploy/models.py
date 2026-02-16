"""GNN-based cleavage site prediction model (inference only).

Combined multi-protease model using graph neural networks on molecular
representations of peptide sequences.  Supports 28 MEROPS proteases via
a learned protease embedding.
"""

import torch
from rdkit import Chem
from rdkit.Chem import (
    Bond,
    FragmentOnBonds,
    GetMolFrags,
    MolFromSequence,
    MolFromSmarts,
    SanitizeFlags,
    SanitizeMol,
)
from torch_geometric.data import Data
from torch_geometric.nn import MeanAggregation, TransformerConv
from torch_geometric.nn.conv import GatedGraphConv
from torch_geometric.nn.norm import BatchNorm

# ── Constants ──────────────────────────────────────────────────────────

PROTEASE_CODES = [
    "A01.009", "A01.010", "A02.001",
    "C01.032", "C01.034", "C01.036", "C01.060", "C13.004",
    "C14.003", "C14.004", "C14.005", "C14.006",
    "M10.003", "M10.005", "M12.002", "M12.004",
    "S01.001", "S01.010", "S01.131", "S01.133", "S01.135",
    "S01.139", "S01.151", "S01.217", "S01.269",
    "S08.071", "S26.001", "S26.010",
]

PARAMS = {
    "hidden_channels": 600,
    "window_size": 4,
    "num_layers": 4,
}

MAX_LEN = 200
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# ── Feature encoding helpers ───────────────────────────────────────────

def _encode(value, allowable_set):
    if value not in allowable_set:
        value = allowable_set[-1]
    return [int(value == s) for s in allowable_set]


def _find_index(element: int, atom_ids: tuple[tuple[int]]) -> int:
    for i, sublist in enumerate(atom_ids):
        if element in sublist:
            return i
    return -1


# ── Peptide graph data structure ───────────────────────────────────────

ELEMENTS = [35, 6, 7, 8, 9, 15, 16, 17, 53]
ATOM_FEATURES = {
    "atomic_num": ELEMENTS,
    "degree": [0, 1, 2, 3, 4, 5],
    "formal_charge": [-1, -2, 1, 2, 0],
    "chiral_tag": [0, 1, 2, 3],
    "num_Hs": [0, 1, 2, 3, 4],
    "hybridization": [
        Chem.rdchem.HybridizationType.SP,
        Chem.rdchem.HybridizationType.SP2,
        Chem.rdchem.HybridizationType.SP3,
        Chem.rdchem.HybridizationType.SP3D,
        Chem.rdchem.HybridizationType.SP3D2,
    ],
    "valence": [1, 2, 3, 4, 5, 6, 7, 8],
}
AMIDE_BOND = MolFromSmarts("[CX3:3](=[OX1])[NX3H1,NX3H0,NX4H2,NX4H1:4]")
MAX_RING_SIZE = 8


def _is_in_small_ring(bond: Bond):
    for ring_size in range(3, MAX_RING_SIZE + 1):
        if bond.IsInRingSize(ring_size):
            return True
    return False


class Peptide(Data):
    """PyG Data subclass representing a peptide as a molecular graph."""

    def __inc__(self, key, value, *args, **kwargs):
        if key in {"aminoacid_index", "edge_index"}:
            return self.num_aminoacids
        if key == "inner_edge_index":
            return self.num_nodes
        return super().__inc__(key, value, *args, **kwargs)

    @classmethod
    def from_mol(cls, mol, sequence):
        flag = SanitizeMol(mol, catchErrors=True)
        if flag != SanitizeFlags.SANITIZE_NONE:
            SanitizeMol(mol, sanitizeOps=SanitizeFlags.SANITIZE_ALL ^ flag)

        x = torch.tensor(
            [
                _encode(atom.GetAtomicNum(), ATOM_FEATURES["atomic_num"])
                + _encode(atom.GetTotalDegree(), ATOM_FEATURES["degree"])
                + _encode(atom.GetFormalCharge(), ATOM_FEATURES["formal_charge"])
                + _encode(int(atom.GetChiralTag()), ATOM_FEATURES["chiral_tag"])
                + _encode(int(atom.GetTotalNumHs()), ATOM_FEATURES["num_Hs"])
                + _encode(int(atom.GetHybridization()), ATOM_FEATURES["hybridization"])
                + _encode(atom.GetTotalValence(), ATOM_FEATURES["valence"])
                for atom in mol.GetAtoms()
            ],
            dtype=torch.long,
        )

        amide_bonds = [
            mol.GetBondBetweenAtoms(left, right).GetIdx()
            for left, _, right in mol.GetSubstructMatches(AMIDE_BOND, maxMatches=100000000)
        ]
        broken_bonds = [
            bond for bond in amide_bonds
            if not _is_in_small_ring(mol.GetBondWithIdx(bond))
        ]

        fragments = FragmentOnBonds(mol, broken_bonds, addDummies=True)
        bond_atoms = [
            (
                mol.GetBondWithIdx(bond).GetBeginAtomIdx(),
                mol.GetBondWithIdx(bond).GetEndAtomIdx(),
            )
            for bond in broken_bonds
        ]
        atom_ids = GetMolFrags(fragments)
        assert len(atom_ids) == len(sequence), f"{len(atom_ids)} != {len(sequence)}"

        edges = [
            [_find_index(x_val, atom_ids), _find_index(y_val, atom_ids)]
            for x_val, y_val in bond_atoms
        ]
        edge_index = (
            torch.tensor(
                [edge for pair in edges for edge in [pair, [pair[1], pair[0]]]],
                dtype=torch.long,
            )
            .t()
            .contiguous()
        )

        inner_edge_index = []
        edge_attr = []
        for bond in mol.GetBonds():
            begin_atom = bond.GetBeginAtomIdx()
            end_atom = bond.GetEndAtomIdx()
            inner_edge_index.append([begin_atom, end_atom])
            inner_edge_index.append([end_atom, begin_atom])

            bond_attr = _encode(
                bond.GetBondType(),
                [
                    Chem.rdchem.BondType.SINGLE,
                    Chem.rdchem.BondType.DOUBLE,
                    Chem.rdchem.BondType.TRIPLE,
                    Chem.rdchem.BondType.AROMATIC,
                ],
            )
            bond_attr.append(int(bond.GetIdx() in broken_bonds))
            edge_attr.append(bond_attr)
            edge_attr.append(bond_attr)

        inner_edge_index = (
            torch.tensor(inner_edge_index, dtype=torch.long).t().contiguous()
        )
        edge_attr = torch.tensor(edge_attr, dtype=torch.float)

        aminoacid_index = [
            _find_index(atom.GetIdx(), atom_ids) for atom in mol.GetAtoms()
        ]
        aminoacid_index = torch.tensor(aminoacid_index, dtype=torch.long)

        num_aminoacids = len(atom_ids)

        return cls(
            x=x,
            edge_index=edge_index,
            inner_edge_index=inner_edge_index,
            edge_attr=edge_attr,
            aminoacid_index=aminoacid_index,
            num_aminoacids=num_aminoacids,
        )


torch.serialization.add_safe_globals([Peptide])


# ── Combined multi-protease GNN model ─────────────────────────────────

class CombinedModel(torch.nn.Module):
    def __init__(
        self,
        num_proteases: int,
        hidden_channels: int = 600,
        window_size: int = 4,
        num_layers: int = 4,
        mlp_hidden_channels: int = 128,
        protease_emb_dim: int = 32,
    ):
        super().__init__()
        in_channels = 42

        self.batch_norm = BatchNorm(in_channels)
        self.inner_conv = TransformerConv(
            in_channels=in_channels, out_channels=hidden_channels, edge_dim=5
        )
        self.inner_conv_2 = GatedGraphConv(
            out_channels=hidden_channels, num_layers=num_layers
        )

        self.mean = MeanAggregation()
        self.batch_norm_2 = torch.nn.BatchNorm1d(hidden_channels)

        self.protease_embedding = torch.nn.Embedding(num_proteases, protease_emb_dim)
        self.protease_proj = torch.nn.Linear(
            hidden_channels + protease_emb_dim, hidden_channels
        )

        self.conv = GatedGraphConv(
            out_channels=hidden_channels, num_layers=window_size
        )

        self.mlp = torch.nn.Sequential(
            torch.nn.Linear(2 * hidden_channels, mlp_hidden_channels),
            torch.nn.ReLU(),
            torch.nn.Linear(mlp_hidden_channels, 1),
        )

    def forward(self, data):
        x = data.x.float()
        x = self.batch_norm(x)

        x = self.inner_conv(x, data.inner_edge_index, data.edge_attr)
        x = self.inner_conv_2(x, data.inner_edge_index)

        x = self.mean(x, data.aminoacid_index)
        x = self.batch_norm_2(x)

        emb = self.protease_embedding(data.protease_id)
        x = torch.cat([x, emb], dim=-1)
        x = self.protease_proj(x)
        x = torch.relu(x)

        x = self.conv(x, data.edge_index)

        source, destination = data.edge_index
        x = torch.hstack((x[source], x[destination]))
        x = x[::2]
        x = self.mlp(x)
        return x.view(-1)


# ── Inference helpers ──────────────────────────────────────────────────

def sequence_to_graph(sequence: str) -> Peptide:
    """Convert an amino acid sequence string to a Peptide graph."""
    if len(sequence) > MAX_LEN:
        raise ValueError(f"Sequence length {len(sequence)} exceeds maximum {MAX_LEN}")
    invalid = set(sequence) & {"U", "X", "Z"}
    if invalid:
        raise ValueError(f"Sequence contains unsupported amino acids: {', '.join(sorted(invalid))}")
    mol = MolFromSequence(sequence, sanitize=False)
    if mol is None:
        raise ValueError(f"Could not parse sequence: {sequence}")
    return Peptide.from_mol(mol, sequence=sequence)


def load_combined_model(weights_path: str = "weights/combined.pt"):
    """Load the combined model checkpoint; returns (model, protease_codes)."""
    checkpoint = torch.load(weights_path, map_location=DEVICE, weights_only=False)
    protease_codes = checkpoint["protease_codes"]
    params = checkpoint["params"]
    model = CombinedModel(
        num_proteases=len(protease_codes),
        hidden_channels=params["hidden_channels"],
        window_size=params["window_size"],
        num_layers=params["num_layers"],
    )
    model.load_state_dict(checkpoint["model_state_dict"])
    model.to(DEVICE)
    model.eval()
    return model, protease_codes


def predict_all_proteases(model, sequence: str, protease_codes: list[str]):
    """Run prediction for all proteases on a single sequence.

    Returns a list of bond dicts:
        [
            {
                "position": 1,          # 1-indexed P1 position
                "p1": "K",              # P1 amino acid
                "p1_prime": "G",        # P1' amino acid
                "scores": {"A01.009": 0.02, ...}
            },
            ...
        ]
    """
    graph = sequence_to_graph(sequence)
    code_to_idx = {c: i for i, c in enumerate(protease_codes)}
    n_aa = int(graph.num_aminoacids)
    edges = graph.edge_index[:, ::2]  # one direction only

    # Collect per-protease probabilities
    all_probs = {}
    with torch.no_grad():
        for code in protease_codes:
            g = graph.clone()
            g.protease_id = torch.full((n_aa,), code_to_idx[code], dtype=torch.long)
            g = g.to(DEVICE)
            logits = model(g)
            probs = torch.sigmoid(logits).cpu().tolist()
            all_probs[code] = probs

    # Build bond-level results
    edges_np = edges.cpu().numpy()
    bonds = []
    for i in range(edges_np.shape[1]):
        src, dst = int(edges_np[0][i]), int(edges_np[1][i])
        scores = {code: round(all_probs[code][i], 4) for code in protease_codes}
        bonds.append({
            "position": src + 1,
            "p1": sequence[src],
            "p1_prime": sequence[dst],
            "scores": scores,
        })
    bonds.sort(key=lambda b: b["position"])
    return bonds
