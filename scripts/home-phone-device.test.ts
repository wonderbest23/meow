import assert from "node:assert/strict";
import { PHONE_DEVICE, phoneDeviceFrame } from "../lib/home-phone-device";

assert.ok(Math.abs(PHONE_DEVICE.width / PHONE_DEVICE.height - 71.5 / 149.6) < 1e-10);
assert.ok(Math.abs(PHONE_DEVICE.screenWidth / PHONE_DEVICE.screenHeight - 1206 / 2622) < 1e-10);
const bezelX = (PHONE_DEVICE.width - PHONE_DEVICE.screenWidth * PHONE_DEVICE.screenScale) / 2;
const bezelY = (PHONE_DEVICE.height - PHONE_DEVICE.screenHeight * PHONE_DEVICE.screenScale) / 2;
assert.ok(bezelX > .09 && bezelX < .12);
assert.ok(bezelY > .09 && bezelY < .12);

for (const [width, height, copyBottom] of [[320, 628, 185], [453, 628, 185], [642, 628, 390], [840, 628, 390], [1440, 836, 530]]) {
  const frame = phoneDeviceFrame(width, height, copyBottom);
  const top = frame.centerY - frame.deviceHeight / 2;
  const bottom = frame.centerY + frame.deviceHeight / 2;
  const halfWidth = frame.deviceHeight / 7.42 * 3.72 / 2;
  assert.ok(frame.viewHeight > PHONE_DEVICE.height);
  assert.ok(top >= (frame.stacked ? copyBottom + 20 : width <= 900 ? 20 : 28) - .01, `copy collision at ${width}`);
  assert.ok(bottom <= height - (frame.stacked ? 48 : width <= 900 ? 104 : 64) + .01, `footer collision at ${width}`);
  assert.ok(frame.centerX - halfWidth > 0 && frame.centerX + halfWidth < width);
  assert.equal(frame.stacked, width < 600);
}
assert.ok(phoneDeviceFrame(642, 628, 390).deviceHeight > 500, "Tablet mockup must remain large");
assert.ok(phoneDeviceFrame(453, 628, 185).deviceHeight > 370, "Mobile mockup must not shrink back to 290px");
console.log("Phone device: physical proportions, even bezels and responsive framing passed");
