from __future__ import annotations

import json
import random
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import numpy as np
import torch
from PIL import Image, ImageDraw
from torch.utils.data import Dataset

VESSEL_CATEGORY_NAMES = {
    "not dilated vessel",
    "Intermediately dilated vessel",
    "highly dilated vessel",
}


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as stream:
        return json.load(stream)


def local_image_key(path: Path) -> str:
    return path.stem.removesuffix("_rgb_labels")


def image_files(directory: Path) -> list[Path]:
    extensions = {".png", ".jpg", ".jpeg", ".tif", ".tiff"}
    return sorted(path for path in directory.iterdir() if path.suffix.lower() in extensions)


def resolve_manifest_images(manifest_path: Path) -> dict[str, dict[str, Any]]:
    records = load_json(manifest_path)
    if not isinstance(records, list):
        raise ValueError("O manifesto deve conter uma lista de imagens.")
    return {Path(str(record["file_name"])).stem: record for record in records}


def vessel_category_ids(coco: dict[str, Any]) -> set[int]:
    ids = {
        int(category["id"])
        for category in coco["categories"]
        if category.get("name") in VESSEL_CATEGORY_NAMES
    }
    if len(ids) != len(VESSEL_CATEGORY_NAMES):
        raise ValueError("As tres categorias vasculares esperadas nao foram encontradas no COCO.")
    return ids


def generate_binary_masks(
    coco_path: Path,
    manifest_path: Path,
    images_dir: Path,
    masks_dir: Path,
) -> dict[str, int]:
    coco = load_json(coco_path)
    manifest = resolve_manifest_images(manifest_path)
    categories = vessel_category_ids(coco)
    annotations_by_image: dict[int, list[dict[str, Any]]] = {}
    for annotation in coco["annotations"]:
        if int(annotation["category_id"]) in categories:
            annotations_by_image.setdefault(int(annotation["image_id"]), []).append(annotation)

    masks_dir.mkdir(parents=True, exist_ok=True)
    summary: dict[str, int] = {}
    for image_path in image_files(images_dir):
        key = local_image_key(image_path)
        if key not in manifest:
            raise ValueError(f"Imagem local sem correspondencia no manifesto: {image_path.name}")
        record = manifest[key]
        with Image.open(image_path) as source:
            size = source.size
        expected = (int(record["width"]), int(record["height"]))
        if size != expected:
            raise ValueError(
                f"Dimensoes divergentes em {image_path.name}: arquivo={size}, manifesto={expected}"
            )

        mask = Image.new("L", size, color=0)
        draw = ImageDraw.Draw(mask)
        count = 0
        for annotation in annotations_by_image.get(int(record["id"]), []):
            for polygon in annotation.get("segmentation", []):
                if len(polygon) < 6 or len(polygon) % 2:
                    raise ValueError(f"Poligono invalido na anotacao {annotation.get('id')}")
                points = list(zip(polygon[0::2], polygon[1::2], strict=True))
                draw.polygon(points, fill=255)
            count += 1
        mask.save(masks_dir / image_path.name)
        summary[image_path.name] = count
    return summary


def paired_files(images_dir: Path, masks_dir: Path) -> list[tuple[Path, Path]]:
    pairs = [(image, masks_dir / image.name) for image in image_files(images_dir)]
    missing = [mask.name for _, mask in pairs if not mask.is_file()]
    if missing:
        raise FileNotFoundError(f"Mascaras ausentes: {', '.join(missing)}")
    if not pairs:
        raise ValueError("Nenhuma imagem foi encontrada.")
    return pairs


def split_pairs(
    pairs: Sequence[tuple[Path, Path]], validation_fraction: float, seed: int
) -> tuple[list[tuple[Path, Path]], list[tuple[Path, Path]]]:
    if len(pairs) < 2:
        raise ValueError("Sao necessarias pelo menos duas imagens para treino e validacao.")
    if not 0 < validation_fraction < 1:
        raise ValueError("A fracao de validacao deve estar entre 0 e 1.")
    shuffled = list(pairs)
    random.Random(seed).shuffle(shuffled)
    validation_size = max(1, round(len(shuffled) * validation_fraction))
    validation_size = min(validation_size, len(shuffled) - 1)
    return shuffled[validation_size:], shuffled[:validation_size]


def annotated_input_names(pairs: Sequence[tuple[Path, Path]]) -> list[str]:
    return [image.name for image, _ in pairs if image.stem.endswith("_labels")]


class VascularDataset(Dataset[tuple[torch.Tensor, torch.Tensor, str]]):
    def __init__(
        self,
        pairs: Sequence[tuple[Path, Path]],
        image_size: int,
        augment: bool = False,
    ) -> None:
        if image_size < 16 or image_size % 16:
            raise ValueError("image_size deve ser multiplo de 16 e pelo menos 16.")
        self.pairs = list(pairs)
        self.image_size = image_size
        self.augment = augment

    def __len__(self) -> int:
        return len(self.pairs)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, torch.Tensor, str]:
        image_path, mask_path = self.pairs[index]
        with Image.open(image_path) as source:
            image = source.convert("RGB").resize(
                (self.image_size, self.image_size), Image.Resampling.BILINEAR
            )
            image_array = np.asarray(image, dtype=np.float32) / 255.0
        with Image.open(mask_path) as source:
            mask = source.convert("L").resize(
                (self.image_size, self.image_size), Image.Resampling.NEAREST
            )
            mask_array = (np.asarray(mask, dtype=np.uint8) > 0).astype(np.float32)

        image_tensor = torch.from_numpy(image_array.transpose(2, 0, 1).copy())
        mask_tensor = torch.from_numpy(mask_array[None, ...].copy())
        if self.augment:
            if torch.rand(()) < 0.5:
                image_tensor = torch.flip(image_tensor, dims=(2,))
                mask_tensor = torch.flip(mask_tensor, dims=(2,))
            if torch.rand(()) < 0.5:
                image_tensor = torch.flip(image_tensor, dims=(1,))
                mask_tensor = torch.flip(mask_tensor, dims=(1,))
        return image_tensor, mask_tensor, image_path.name

