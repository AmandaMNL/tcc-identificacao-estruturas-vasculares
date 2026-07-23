from pathlib import Path

import pytest

from vascular_segmentation.data import annotated_input_names, local_image_key, split_pairs


def test_local_image_key_accepts_current_and_raw_names() -> None:
    assert local_image_key(Path("2_rgb_labels.png")) == "2"
    assert local_image_key(Path("2.png")) == "2"


def test_split_is_reproducible_and_disjoint() -> None:
    pairs = [(Path(f"{index}.png"), Path(f"{index}.png")) for index in range(10)]
    first = split_pairs(pairs, validation_fraction=0.2, seed=42)
    second = split_pairs(pairs, validation_fraction=0.2, seed=42)
    assert first == second
    assert len(first[0]) == 8
    assert len(first[1]) == 2
    assert set(first[0]).isdisjoint(first[1])


def test_split_requires_two_images() -> None:
    with pytest.raises(ValueError):
        split_pairs([(Path("1.png"), Path("1.png"))], 0.2, 42)


def test_annotated_names_are_reported() -> None:
    pairs = [(Path("2_rgb_labels.png"), Path("2_rgb_labels.png"))]
    assert annotated_input_names(pairs) == ["2_rgb_labels.png"]

