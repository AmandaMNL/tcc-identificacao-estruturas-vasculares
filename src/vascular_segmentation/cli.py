from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from PIL import Image
from torch.utils.data import DataLoader

from .data import (
    VascularDataset,
    annotated_input_names,
    generate_binary_masks,
    paired_files,
    split_pairs,
)
from .training import evaluate_model, load_checkpoint, train_model

ROOT = Path(__file__).resolve().parents[2]


def device_from_argument(value: str) -> torch.device:
    if value == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if value == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA foi solicitada, mas nao esta disponivel.")
    return torch.device(value)


def ensure_inputs_are_acceptable(
    pairs: list[tuple[Path, Path]], allow_annotated_inputs: bool
) -> None:
    suspect = annotated_input_names(pairs)
    if suspect and not allow_annotated_inputs:
        names = ", ".join(suspect)
        raise ValueError(
            "O treino foi interrompido porque os nomes indicam imagens com rotulos desenhados: "
            f"{names}. Use imagens brutas ou confirme conscientemente com "
            "--allow-annotated-inputs para uma execucao apenas exploratoria."
        )


def command_masks(args: argparse.Namespace) -> None:
    summary = generate_binary_masks(args.coco, args.manifest, args.images, args.masks)
    print(json.dumps({"images": len(summary), "vessels": sum(summary.values()), "per_image": summary}, indent=2))


def command_train(args: argparse.Namespace) -> None:
    pairs = paired_files(args.images, args.masks)
    ensure_inputs_are_acceptable(pairs, args.allow_annotated_inputs)
    train_pairs, validation_pairs = split_pairs(pairs, args.validation_fraction, args.seed)
    device = device_from_argument(args.device)
    print(
        f"device={device.type} train_images={len(train_pairs)} "
        f"validation_images={len(validation_pairs)}"
    )
    train_model(
        VascularDataset(train_pairs, args.image_size, augment=True),
        VascularDataset(validation_pairs, args.image_size),
        args.checkpoint,
        args.epochs,
        args.batch_size,
        args.learning_rate,
        args.threshold,
        args.seed,
        args.base_channels,
        device,
    )


def command_evaluate(args: argparse.Namespace) -> None:
    device = device_from_argument(args.device)
    model, checkpoint = load_checkpoint(args.checkpoint, device)
    all_pairs = paired_files(args.images, args.masks)
    lookup = {image.name: (image, mask) for image, mask in all_pairs}
    names = checkpoint["validation_files"]
    missing = [name for name in names if name not in lookup]
    if missing:
        raise FileNotFoundError(f"Arquivos da validacao ausentes: {', '.join(missing)}")
    dataset = VascularDataset([lookup[name] for name in names], int(checkpoint["image_size"]))
    metrics = evaluate_model(
        model,
        DataLoader(dataset, batch_size=args.batch_size, shuffle=False),
        device,
        float(checkpoint["threshold"]),
    )
    print(json.dumps({"files": names, **metrics}, indent=2))


def command_predict(args: argparse.Namespace) -> None:
    device = device_from_argument(args.device)
    model, checkpoint = load_checkpoint(args.checkpoint, device)
    image_size = int(checkpoint["image_size"])
    with Image.open(args.image) as source:
        original_size = source.size
        rgb = source.convert("RGB").resize((image_size, image_size), Image.Resampling.BILINEAR)
    import numpy as np

    array = np.asarray(rgb, dtype=np.float32) / 255.0
    tensor = torch.from_numpy(array.transpose(2, 0, 1).copy()).unsqueeze(0).to(device)
    with torch.no_grad():
        probabilities = torch.sigmoid(model(tensor))[0, 0].cpu().numpy()
    mask = Image.fromarray(
        ((probabilities >= float(checkpoint["threshold"])) * 255).astype(np.uint8)
    ).resize(original_size, Image.Resampling.NEAREST)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    mask.save(args.output)
    print(args.output)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Segmentacao vascular em tecidos tumorais")
    subparsers = parser.add_subparsers(dest="command", required=True)

    masks = subparsers.add_parser("masks", help="Gerar mascaras binarias a partir do COCO")
    masks.add_argument("--coco", type=Path, default=ROOT / "data/annotations/COCO_annotations.json")
    masks.add_argument("--manifest", type=Path, default=ROOT / "data/annotations/DCIS.Patient_001.2.json")
    masks.add_argument("--images", type=Path, default=ROOT / "data/images")
    masks.add_argument("--masks", type=Path, default=ROOT / "data/mask")
    masks.set_defaults(handler=command_masks)

    train = subparsers.add_parser("train", help="Treinar uma U-Net")
    train.add_argument("--images", type=Path, default=ROOT / "data/images")
    train.add_argument("--masks", type=Path, default=ROOT / "data/mask")
    train.add_argument("--checkpoint", type=Path, default=ROOT / "checkpoints/best.pt")
    train.add_argument("--epochs", type=int, default=50)
    train.add_argument("--batch-size", type=int, default=2)
    train.add_argument("--image-size", type=int, default=256)
    train.add_argument("--base-channels", type=int, default=32)
    train.add_argument("--learning-rate", type=float, default=1e-3)
    train.add_argument("--validation-fraction", type=float, default=0.2)
    train.add_argument("--threshold", type=float, default=0.5)
    train.add_argument("--seed", type=int, default=42)
    train.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    train.add_argument("--allow-annotated-inputs", action="store_true")
    train.set_defaults(handler=command_train)

    evaluate = subparsers.add_parser("evaluate", help="Avaliar o subconjunto salvo no checkpoint")
    evaluate.add_argument("--images", type=Path, default=ROOT / "data/images")
    evaluate.add_argument("--masks", type=Path, default=ROOT / "data/mask")
    evaluate.add_argument("--checkpoint", type=Path, default=ROOT / "checkpoints/best.pt")
    evaluate.add_argument("--batch-size", type=int, default=2)
    evaluate.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    evaluate.set_defaults(handler=command_evaluate)

    predict = subparsers.add_parser("predict", help="Gerar mascara para uma imagem")
    predict.add_argument("image", type=Path)
    predict.add_argument("--checkpoint", type=Path, default=ROOT / "checkpoints/best.pt")
    predict.add_argument("--output", type=Path, default=ROOT / "artifacts/prediction.png")
    predict.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    predict.set_defaults(handler=command_predict)
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    try:
        args.handler(args)
    except (FileNotFoundError, RuntimeError, ValueError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
