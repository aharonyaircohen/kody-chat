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
  positionAt,
  answerCompletesStep,
  nextPointer,
  type GuidePosition,
} from "./engine";
export {
  guideConfigSchema,
  guideStepSchema,
  guidePointerKey,
  GUIDE_ADVANCE_MODES,
  type GuideConfig,
  type GuideStep,
} from "./types";
