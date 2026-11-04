#pragma once
#include <algorithm>
#include <cstdint>
#include <sstream>

namespace ipc {

/**
 * Tracks cumulative USB lighting output counters so the Node service can compute
 * exact frame/packet deltas even when intermediate IPC telemetry lines are coalesced:
 * - `frames`: total lighting frames written to the USB HID device.
 * - `rendered`: distinct newly rendered client frames (excluding repeated/reused frames).
 * - `longGaps`: count of inter-frame intervals exceeding the 100 ms stall threshold.
 */
struct FrameTelemetry {
  uint64_t frames = 0;
  uint64_t packets = 0;
  uint64_t rendered = 0;
  uint64_t longGaps = 0;
  uint64_t lastSubmission = 0;
  double maxGap = 0;

  void custom(uint64_t submission, size_t count, double gap) {
    if (!frames || submission != lastSubmission) {
      ++rendered;
    }
    lastSubmission = submission;
    record(count, gap);
  }

  void record(size_t count, double gap) {
    ++frames;
    packets += count;
    maxGap = (std::max)(maxGap, gap);
    if (gap > 100) {
      ++longGaps;
    }
  }

  void append(std::ostringstream& event) const {
    event << ",\"outputFrames\":" << frames
          << ",\"outputPackets\":" << packets
          << ",\"renderedFrames\":" << rendered
          << ",\"outputMaxGapMs\":" << maxGap
          << ",\"outputLongGaps\":" << longGaps;
  }
};

} // namespace ipc
