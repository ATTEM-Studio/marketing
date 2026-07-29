import { expect, test, vi } from "vitest";
import { createSecretEntry } from "../src/admin/secret-entry";

test("unlocks exactly on the tenth press inside five seconds", () => {
  const unlock = vi.fn();
  const entry = createSecretEntry({
    presses: 10,
    windowMs: 5000,
    onUnlock: unlock,
  });

  for (let index = 0; index < 9; index += 1) entry.press(index * 400);
  expect(unlock).not.toHaveBeenCalled();
  entry.press(3600);

  expect(unlock).toHaveBeenCalledOnce();
});

test("resets when the five-second window expires", () => {
  const unlock = vi.fn();
  const entry = createSecretEntry({
    presses: 10,
    windowMs: 5000,
    onUnlock: unlock,
  });

  entry.press(0);
  for (let index = 0; index < 9; index += 1) entry.press(6000 + index);

  expect(unlock).not.toHaveBeenCalled();
});

test("resets after unlocking so another sequence must contain ten new presses", () => {
  const unlock = vi.fn();
  const entry = createSecretEntry({
    presses: 10,
    windowMs: 5000,
    onUnlock: unlock,
  });

  for (let index = 0; index < 10; index += 1) entry.press(index);
  for (let index = 0; index < 9; index += 1) entry.press(20 + index);

  expect(unlock).toHaveBeenCalledOnce();
});
