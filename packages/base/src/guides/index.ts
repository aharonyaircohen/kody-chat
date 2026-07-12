/**
 * @fileType barrel
 * @domain guides
 * @pattern guides
 * @ai-summary Server barrel for the guides engine + store.
 */
export {
  getGuide,
  listGuides,
  saveGuide,
  deleteGuide,
  GUIDES_DIR,
  _resetGuidesCache,
} from "./store";
export {
  currentByPointer,
  answerCompletesStep,
  nextPointerId,
  type GuidePosition,
} from "./engine";
export {
  guideConfigSchema,
  guideSourceSchema,
  guidePointerKey,
  GUIDE_ADVANCE_MODES,
  GUIDE_FINISHED,
  type GuideConfig,
  type GuideSource,
  type GuideStep,
} from "./types";
