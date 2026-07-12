/**
 * @fileType barrel
 * @domain lessons
 * @pattern lessons
 * @ai-summary Server barrel for the lessons engine + store.
 */
export {
  getLesson,
  listLessons,
  saveLesson,
  deleteLesson,
  LESSONS_DIR,
  _resetLessonsCache,
} from "./store";
export {
  positionAt,
  answerCompletesStep,
  nextPointer,
  type LessonPosition,
} from "./engine";
export {
  lessonConfigSchema,
  lessonStepSchema,
  lessonPointerKey,
  LESSON_ADVANCE_MODES,
  type LessonConfig,
  type LessonStep,
} from "./types";
