export type GamepadAccess = "checking" | "service" | "update" | "driver" | "ready";
/** Fail closed until a live service explicitly confirms the Xbox backend. */
export function gamepadAccess(status: {
  capabilities?: {
    gamepad?: boolean;
  };
  driverAvailable?: boolean;
} | null, checking = false, connected = false): GamepadAccess {
  if (checking) {
    return "checking";
  }
  if (!connected || !status) {
    return "service";
  }
  if (status.capabilities?.gamepad !== true) {
    return "update";
  }
  if (status.driverAvailable !== true) {
    return "driver";
  }
  return "ready";
}
