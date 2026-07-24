from __future__ import annotations

import torch
from torch import nn


class DoubleConv(nn.Sequential):
    def __init__(self, input_channels: int, output_channels: int) -> None:
        super().__init__(
            nn.Conv2d(input_channels, output_channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(output_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(output_channels, output_channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(output_channels),
            nn.ReLU(inplace=True),
        )


class UNet(nn.Module):
    def __init__(self, base_channels: int = 32) -> None:
        super().__init__()
        channels = [base_channels * factor for factor in (1, 2, 4, 8, 16)]
        self.encoders = nn.ModuleList(
            [DoubleConv(3, channels[0])]
            + [DoubleConv(channels[index - 1], channels[index]) for index in range(1, 5)]
        )
        self.pool = nn.MaxPool2d(2)
        self.upconvs = nn.ModuleList(
            [nn.ConvTranspose2d(channels[index], channels[index - 1], 2, stride=2) for index in range(4, 0, -1)]
        )
        self.decoders = nn.ModuleList(
            [DoubleConv(channels[index] * 2, channels[index]) for index in range(3, -1, -1)]
        )
        self.output = nn.Conv2d(channels[0], 1, kernel_size=1)

    def forward(self, inputs: torch.Tensor) -> torch.Tensor:
        skips: list[torch.Tensor] = []
        value = inputs
        for encoder in self.encoders[:-1]:
            value = encoder(value)
            skips.append(value)
            value = self.pool(value)
        value = self.encoders[-1](value)
        for upconv, decoder, skip in zip(self.upconvs, self.decoders, reversed(skips), strict=True):
            value = upconv(value)
            value = decoder(torch.cat((skip, value), dim=1))
        return self.output(value)

