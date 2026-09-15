// Front proportions follow iPhone 17's 71.5 x 149.6 mm body and 1206 x 2622 display.
export const PHONE_DEVICE = {
  width: 3.36,
  height: 3.36 * 149.6 / 71.5,
  depth: 3.36 * 7.95 / 71.5,
  screenWidth: 360,
  screenHeight: 360 * 2622 / 1206,
  screenScale: 3.14 / 360,
  screenZ: .195,
} as const;

export function phoneDeviceFrame(width: number, height: number, copyBottom: number) {
  const stacked = width < 600;
  const top = stacked ? copyBottom + 20 : width <= 900 ? 20 : 28;
  const bottom = stacked ? 48 : width <= 900 ? 104 : 64;
  const availableWidth = stacked ? width - 72 : width * .46 - 32;
  // Include the small rotation, final-scene scale and perspective in the fit.
  const deviceHeight = Math.max(1, Math.min(height - top - bottom, availableWidth * 7.42 / 3.72, 730));
  return {
    stacked,
    deviceHeight,
    viewHeight: 7.42 * height / deviceHeight,
    centerX: stacked ? width / 2 : width * .755,
    centerY: top + (height - top - bottom) / 2,
  };
}
