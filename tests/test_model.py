import torch

from vascular_segmentation.model import UNet
from vascular_segmentation.training import overlap_metrics


def test_unet_preserves_spatial_dimensions() -> None:
    output = UNet(base_channels=4)(torch.zeros(1, 3, 32, 32))
    assert output.shape == (1, 1, 32, 32)


def test_overlap_metrics_for_exact_match() -> None:
    assert overlap_metrics(10, 0, 0) == {"dice": 1.0, "iou": 1.0}

