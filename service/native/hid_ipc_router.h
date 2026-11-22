#pragma once
#include <algorithm>
#include <atomic>
#include <deque>
#include <mutex>
#include <string>

namespace hid_ipc {

/**
 * Pops one pending IPC command line from the stdin queue when the output queue
 * has room for a reply, keeping lighting frame deadlines ahead of backlogged IPC.
 */
template <typename OutputQueue>
inline bool tryDequeueCommandLine(
    OutputQueue& outputQueue,
    std::mutex& queueMutex,
    std::deque<std::string>& queue,
    std::string& outLine) {
  if (!outputQueue.canReply()) {
    return false;
  }
  std::lock_guard<std::mutex> lock(queueMutex);
  if (queue.empty()) {
    return false;
  }
  outLine = std::move(queue.front());
  queue.pop_front();
  return true;
}

/**
 * Computes the next waitable-timer wakeup deadline across gamepad telemetry,
 * raw input streaming, RGB/rhythm rendering, and Hall sensor polling.
 */
template <typename Session>
inline double computeNextDeadlineMs(const Session& session, bool suspended) {
  double deadline = session.nextGamepadPublish;
  if (session.inputStreaming) {
    deadline = std::min(deadline, session.nextInputPublish);
  }
  if ((session.rhythmActive || session.customActive) &&
      !session.rhythmPaused &&
      !suspended) {
    deadline = std::min(deadline, session.nextFrame);
  }
  if (!session.rhythmPaused && !session.gamepadPaused && !suspended) {
    deadline = std::min(deadline, session.hallScheduler.deadline());
  }
  return deadline;
}

}  // namespace hid_ipc
