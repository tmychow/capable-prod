import os

import numpy as np
import tensorflow as tf

from utils import mmps


# --- Transformer building blocks ---

def positional_encoding(length, depth):
    depth = depth / 2
    positions = np.arange(length)[:, np.newaxis]
    depths = np.arange(depth)[np.newaxis, :] / depth
    angle_rates = 1 / (10000**depths)
    angle_rads = positions * angle_rates
    pos_encoding = np.concatenate(
        [np.sin(angle_rads), np.cos(angle_rads)], axis=-1
    )
    return tf.cast(pos_encoding, dtype=tf.float32)


class PositionalEmbedding(tf.keras.layers.Layer):
    def __init__(self, vocab_size, d_model, max_seq_length=15, mask_zero=True, **kwargs):
        super().__init__(**kwargs)
        self.d_model = d_model
        self.embedding = tf.keras.layers.Embedding(vocab_size, d_model, mask_zero=mask_zero)
        self.pos_encoding = positional_encoding(length=max_seq_length, depth=d_model)

    def call(self, x):
        x = self.embedding(x)
        length = tf.shape(x)[1]
        x *= tf.math.sqrt(tf.cast(self.d_model, tf.float32))
        x = x + self.pos_encoding[tf.newaxis, :length, :]
        return x


class BaseAttention(tf.keras.layers.Layer):
    def __init__(self, **kwargs):
        super().__init__()
        self.mha = tf.keras.layers.MultiHeadAttention(**kwargs)
        self.layernorm = tf.keras.layers.LayerNormalization()
        self.add = tf.keras.layers.Add()


class GlobalSelfAttention(BaseAttention):
    def call(self, x):
        attn_output = self.mha(query=x, value=x, key=x)
        x = self.add([x, attn_output])
        x = self.layernorm(x)
        return x


class FeedForward(tf.keras.layers.Layer):
    def __init__(self, d_model, dff, activation="relu", dropout_rate=0.1):
        super().__init__()
        self.seq = tf.keras.Sequential([
            tf.keras.layers.Dense(dff, activation=activation),
            tf.keras.layers.Dense(d_model),
            tf.keras.layers.Dropout(dropout_rate),
        ])
        self.add = tf.keras.layers.Add()
        self.layer_norm = tf.keras.layers.LayerNormalization()

    def call(self, x):
        x = self.add([x, self.seq(x)])
        x = self.layer_norm(x)
        return x


class EncoderLayer(tf.keras.layers.Layer):
    def __init__(self, *, d_model, num_heads, dff, activation="relu", dropout_rate=0.1):
        super().__init__()
        self.self_attention = GlobalSelfAttention(
            num_heads=num_heads, key_dim=d_model, dropout=dropout_rate
        )
        self.ffn = FeedForward(d_model, dff, activation=activation, dropout_rate=dropout_rate)

    def call(self, x):
        x = self.self_attention(x)
        x = self.ffn(x)
        return x


class Encoder(tf.keras.layers.Layer):
    def __init__(self, *, num_layers, d_model, num_heads, dff, vocab_size,
                 activation="relu", dropout_rate=0.1, mask_zero=False):
        super().__init__()
        self.d_model = d_model
        self.num_layers = num_layers
        self.pos_embedding = PositionalEmbedding(
            vocab_size=vocab_size, d_model=d_model, mask_zero=mask_zero
        )
        self.enc_layers = [
            EncoderLayer(d_model=d_model, num_heads=num_heads, dff=dff,
                         activation=activation, dropout_rate=dropout_rate)
            for _ in range(num_layers)
        ]
        self.dropout = tf.keras.layers.Dropout(dropout_rate)

    def call(self, x):
        x = self.pos_embedding(x)
        x = self.dropout(x)
        for i in range(self.num_layers):
            x = self.enc_layers[i](x)
        return x


class TransformerEncoder(tf.keras.Model):
    """Encoder-only transformer for MMP cleavage z-score prediction."""

    def __init__(self, *, num_layers, d_model, num_heads, dff, vocab_size,
                 dropout_rate=0.1, output_dim=None, pool_outputs=False, mask_zero=False):
        super().__init__()
        if output_dim is None:
            output_dim = vocab_size
        self.pool_outputs = pool_outputs
        self.encoder = Encoder(
            num_layers=num_layers, d_model=d_model, num_heads=num_heads,
            dff=dff, vocab_size=vocab_size, dropout_rate=dropout_rate, mask_zero=mask_zero,
        )
        self.final_layer = tf.keras.layers.Dense(output_dim)
        self.vocab_size = vocab_size

    def call(self, x):
        x = self.encoder(x)
        if self.pool_outputs:
            x = tf.squeeze(x[:, 0:1, :], axis=1)
        logits = self.final_layer(x)
        return logits


# --- Vocabulary & inference helpers ---

VOCAB = {
    '-': 0, 'A': 1, 'C': 2, 'D': 3, 'E': 4, 'F': 5, 'G': 6, 'H': 7,
    'I': 8, 'K': 9, 'L': 10, 'M': 11, 'N': 12, 'P': 13, 'Q': 14, 'R': 15,
    'S': 16, 'T': 17, 'V': 18, 'W': 19, 'Y': 20, '!': 21
}
CLS_IDX = 21
SEQ_LEN = 10


def _build_predictor(checkpoint_path, mask_zero=True):
    """Build a transformer predictor and load weights from checkpoint."""
    model = TransformerEncoder(
        num_layers=2, d_model=32, num_heads=6, dff=32, vocab_size=22,
        dropout_rate=0, output_dim=18, pool_outputs=True, mask_zero=mask_zero,
    )
    fake_batch = np.array([[CLS_IDX, 20, 14, 8, 9, 13, 10, 9, 16, 17, 3]])
    model(fake_batch, training=False)
    model.load_weights(checkpoint_path)
    return model


def _tokenize(sequences):
    """Pad, tokenize, and prepend CLS token for a list of AA strings."""
    padded = []
    for seq in sequences:
        seq = seq.upper().strip()
        if len(seq) < SEQ_LEN:
            seq = seq + '-' * (SEQ_LEN - len(seq))
        elif len(seq) > SEQ_LEN:
            seq = seq[:SEQ_LEN]
        padded.append(seq)
    tokenized = np.array([[VOCAB[aa] for aa in seq] for seq in padded])
    tokenized = np.stack([np.append(np.array(CLS_IDX), s) for s in tokenized])
    return tokenized


def predict_mmp_scores(sequences, weights_dir='weights/'):
    """
    Minimal inference: amino acid sequences in, per-MMP z-scores out.

    Args:
        sequences: list of amino acid strings (e.g. ['GPAGLAGQRG'])
            Each should be 10 residues. Shorter are padded, longer truncated.
        weights_dir: path containing transformer_0/ ... transformer_4/ subdirs.

    Returns:
        dict with 'scores', 'uncertainties' (keyed by MMP name), and 'sequences'.
    """
    x = _tokenize(sequences)

    ensemble_dirs = [f'transformer_{i}/' for i in range(5)]
    predictions = []
    for edir in ensemble_dirs:
        checkpoint_path = os.path.join(weights_dir, edir, 'model.h5')
        model = _build_predictor(checkpoint_path)
        y_hat = model(x, training=False)
        predictions.append(y_hat.numpy())

    predictions = np.stack(predictions)
    means = np.mean(predictions, axis=0)
    stds = np.std(predictions, axis=0)

    scores = {}
    uncertainties = {}
    for i, mmp_name in enumerate(mmps):
        scores[mmp_name] = means[:, i].tolist()
        uncertainties[mmp_name] = stds[:, i].tolist()

    return {
        'scores': scores,
        'uncertainties': uncertainties,
        'sequences': sequences,
    }
