from __future__ import annotations

import random
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader

from .data import VascularDataset
from .model import UNet


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def dice_loss(logits: torch.Tensor, targets: torch.Tensor, smooth: float = 1.0) -> torch.Tensor:
    probabilities = torch.sigmoid(logits)
    intersection = (probabilities * targets).sum(dim=(1, 2, 3))
    denominator = probabilities.sum(dim=(1, 2, 3)) + targets.sum(dim=(1, 2, 3))
    return 1 - ((2 * intersection + smooth) / (denominator + smooth)).mean()


def combined_loss(logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
    return nn.functional.binary_cross_entropy_with_logits(logits, targets) + dice_loss(
        logits, targets
    )


def confusion_counts(
    logits: torch.Tensor, targets: torch.Tensor, threshold: float
) -> tuple[int, int, int]:
    predictions = torch.sigmoid(logits) >= threshold
    expected = targets >= 0.5
    true_positive = int(torch.logical_and(predictions, expected).sum().item())
    false_positive = int(torch.logical_and(predictions, ~expected).sum().item())
    false_negative = int(torch.logical_and(~predictions, expected).sum().item())
    return true_positive, false_positive, false_negative


def overlap_metrics(true_positive: int, false_positive: int, false_negative: int) -> dict[str, float]:
    dice_denominator = 2 * true_positive + false_positive + false_negative
    iou_denominator = true_positive + false_positive + false_negative
    return {
        "dice": (2 * true_positive / dice_denominator) if dice_denominator else 1.0,
        "iou": (true_positive / iou_denominator) if iou_denominator else 1.0,
    }


def evaluate_model(
    model: nn.Module, loader: DataLoader[Any], device: torch.device, threshold: float
) -> dict[str, float]:
    model.eval()
    total_loss = 0.0
    counts = [0, 0, 0]
    with torch.no_grad():
        for images, masks, _ in loader:
            logits = model(images.to(device))
            targets = masks.to(device)
            total_loss += float(combined_loss(logits, targets).item())
            batch_counts = confusion_counts(logits, targets, threshold)
            counts = [left + right for left, right in zip(counts, batch_counts, strict=True)]
    return {"loss": total_loss / len(loader), **overlap_metrics(*counts)}


def train_model(
    train_dataset: VascularDataset,
    validation_dataset: VascularDataset,
    checkpoint_path: Path,
    epochs: int,
    batch_size: int,
    learning_rate: float,
    threshold: float,
    seed: int,
    base_channels: int,
    device: torch.device,
) -> list[dict[str, float]]:
    seed_everything(seed)
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    validation_loader = DataLoader(validation_dataset, batch_size=batch_size, shuffle=False)
    model = UNet(base_channels=base_channels).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)
    history: list[dict[str, float]] = []
    best_dice = -1.0
    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)

    for epoch in range(1, epochs + 1):
        model.train()
        train_loss = 0.0
        for images, masks, _ in train_loader:
            optimizer.zero_grad(set_to_none=True)
            loss = combined_loss(model(images.to(device)), masks.to(device))
            loss.backward()
            optimizer.step()
            train_loss += float(loss.item())
        metrics = evaluate_model(model, validation_loader, device, threshold)
        record = {"epoch": float(epoch), "train_loss": train_loss / len(train_loader), **metrics}
        history.append(record)
        print(
            f"epoch={epoch} train_loss={record['train_loss']:.6f} "
            f"val_loss={record['loss']:.6f} dice={record['dice']:.6f} iou={record['iou']:.6f}"
        )
        if record["dice"] > best_dice:
            best_dice = record["dice"]
            torch.save(
                {
                    "model_state": model.state_dict(),
                    "model": {"base_channels": base_channels},
                    "image_size": train_dataset.image_size,
                    "threshold": threshold,
                    "seed": seed,
                    "train_files": [pair[0].name for pair in train_dataset.pairs],
                    "validation_files": [pair[0].name for pair in validation_dataset.pairs],
                    "metrics": metrics,
                },
                checkpoint_path,
            )
    return history


def load_checkpoint(path: Path, device: torch.device) -> tuple[UNet, dict[str, Any]]:
    checkpoint = torch.load(path, map_location=device, weights_only=True)
    model = UNet(base_channels=int(checkpoint["model"]["base_channels"]))
    model.load_state_dict(checkpoint["model_state"])
    model.to(device).eval()
    return model, checkpoint

